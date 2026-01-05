# Hierarchical File Support Implementation

## Overview

This document describes the implementation of hierarchical (multi-line) file support in the SWAT+ indexer. This feature addresses the issue where certain input files have records that span multiple physical lines in the file.

## Problem Statement

The original indexer treated each non-empty line as a separate record. This approach doesn't work for hierarchical files where:
- A single logical record (e.g., a soil type) spans multiple physical lines
- The main record line contains the identifier and key properties
- Child lines contain detailed data (e.g., soil layers)

Files affected:
- **soils.sol**: Soil properties with layer data
- **plant.ini**: Plant communities with individual plant details
- **management.sch**: Management schedules with operation details
- **Decision tables (*.dtl)**: Decision tables with conditions, actions, and file pointers
- **weather-wgn.cli**: Weather generator parameters with monthly climate data

## Solution Architecture

### 1. Configuration-Driven Approach

Hierarchical files are defined in `resources/schema/txtinout-metadata.json`:

```json
{
  "hierarchical_files": {
    "soils.sol": {
      "structure": {
        "child_line_count_field": null,
        "indexing_strategy": "Index only main record; skip child lines"
      }
    },
    "plant.ini": {
      "structure": {
        "child_line_count_field": "plnt_cnt",
        "indexing_strategy": "Index only main record; skip N child lines"
      }
    }
  }
}
```

### 2. Two Detection Strategies

#### Strategy 1: Heuristic Detection (soils.sol)

Used when child line count is not explicitly available.

**Logic:**
- Check if the `name` field matches numeric pattern (`/^\d+(\.\d+)?$/`)
- Numeric value → child line (e.g., "150.0" = layer depth)
- Text value → main record (e.g., "clay_loam" = soil name)

**Example:**
```
name         hyd_grp   dp_tot    ...
clay_loam    C         1500.0    ...   <- MAIN RECORD (indexed)
150.0        1.35      0.18      ...   <- CHILD LINE (skipped)
300.0        1.40      0.16      ...   <- CHILD LINE (skipped)
sandy_loam   B         1200.0    ...   <- MAIN RECORD (indexed)
```

#### Strategy 2: Explicit Counting (plant.ini)

Used when a field explicitly specifies the number of child lines.

**Logic:**
- Parse the `plnt_cnt` field from main record
- Skip exactly N lines after processing the main record
- Validate count (must be positive, capped at 1000)

**Example:**
```
name         plnt_cnt  rot_yr_ini  ...
comm_crop    2         1           ...   <- MAIN RECORD (plnt_cnt=2)
corn         ...       ...         ...   <- CHILD 1 (skipped)
soybean      ...       ...         ...   <- CHILD 2 (skipped)
comm_forest  1         1           ...   <- MAIN RECORD (plnt_cnt=1)
oak          ...       ...         ...   <- CHILD 1 (skipped)
```

#### Strategy 2b: Fixed Child Count (weather-wgn.cli)

Used when the number of child lines is fixed for all records.

**Logic:**
- Use `child_line_count_fixed` from configuration (e.g., 13 for weather-wgn.cli)
- Skip exactly N lines after processing each main record
- No field parsing needed - count is constant for the file

**Example:**
```
name         lat       lon        elev      rain_yrs
Imsil        35.61     127.29     247.90    51         <- MAIN RECORD (indexed)
 tmp_max_ave tmp_min_ave ...                           <- CHILD 1: monthly header (skipped)
       -0.64      -10.50 ...                           <- CHILD 2: Jan data (skipped)
        2.86       -7.54 ...                           <- CHILD 3: Feb data (skipped)
...                                                     <- CHILDREN 4-13 (skipped)
me170814     45.67     -69.82     323.10    51         <- MAIN RECORD (indexed)
 tmp_max_ave tmp_min_ave ...                           <- CHILD 1: monthly header (skipped)
       -5.82      -18.16 ...                           <- CHILD 2: Jan data (skipped)
```

**Note:** The weather-wgn.cli file has a fixed structure where each weather station record is followed by 13 child lines: 1 header line for monthly data columns, followed by 12 lines of monthly climate data (one per month).

### 3. Implementation Details

#### Strategy 3: Explicit Counting for management.sch with FK Tracking

Used when operations are listed on child lines following the main record.

**Logic:**
- Parse both `numb_auto` and `numb_ops` fields from main record
- Total child lines = `numb_auto + numb_ops`
- First `numb_auto` lines are decision table references (FK to lum.dtl)
- Next `numb_ops` lines are explicit operations with parameters
- **Process child lines to extract FK references** instead of just skipping
- Validate count (must be positive, capped at 1000)

**FK Tracking for Child Lines:**
- **Auto operations (first `numb_auto` lines)**: Extract decision table name → FK to `lum.dtl`
- **Explicit operations (next `numb_ops` lines)**: Parse operation type and `op_data1` field
  - Maps operation type to target file: `fert`→`fertilizer.frt`, `till`→`tillage.til`, etc.
  - Extracts FK value from `op_data1` field (7th column)

**Example:**
```
name                      numb_ops  numb_auto  ...
agrl_rot                  0         2          ...   <- MAIN RECORD (skip 0+2=2 lines)
    pl_hv_agro                                      <- CHILD 1: dtl ref → lum.dtl (FK tracked)
    fert_stress                                     <- CHILD 2: dtl ref → lum.dtl (FK tracked)
hay_cmz_60__dry_101531    3         1          ...   <- MAIN RECORD (skip 3+1=4 lines)
    hay_fesc                                        <- CHILD 1: dtl ref → lum.dtl (FK tracked)
    fert  0  0  0.2  mhp  broadcast  31.87          <- CHILD 2: fert op → fertilizer.frt:mhp (FK tracked)
    fert  0  0  0.2  mhn  broadcast  74.88          <- CHILD 3: fert op → fertilizer.frt:mhn (FK tracked)
    skip  0  0  0    null null       0              <- CHILD 4: skip op (no FK)
```

**Note:** The first `numb_auto` child lines are FK references to decision tables in `lum.dtl` file. The explicit operation lines contain FK references based on their operation type (op_typ) to various operation files.

### 4. Implementation Details

#### Strategy 4: Complex Multi-Section Parsing (*.dtl files)

Used for decision table files with multiple sections per entry.

**Structure:**
```
Title line
Number of decision tables
For each decision table:
  Header: DTBL_NAME, CONDS, ALTS, ACTS
  Conditions section (CONDS lines)
  Actions section (ACTS lines) <- contains fp field
```

**Logic:**
- Parse the decision table count from line 2
- For each decision table:
  - Read header to get DTBL_NAME and counts (CONDS, ALTS, ACTS)
  - Index the decision table by DTBL_NAME
  - Skip CONDS section header line
  - Skip CONDS data lines (condition section)
  - Skip ACTS section header line
  - Parse ACTS data lines (action section) to extract fp field
  - Create FK references based on action type

**FK Tracking for Actions:**
- Action lines have structure: `act_typ, obj, obj_num, name, option, const, const2, fp, outcome...`
- The `fp` field (index 7) is a file pointer
- Maps action type to target file:
  - `harvest` → `harv.ops`
  - `harvest_kill` → `harv.ops`
  - `pest_apply` → `chem_app.ops`
  - `fertilize` → `chem_app.ops`

**Example:**
```
lum.dtl Generated from database Time: 7/22/2025 3:06:33 PM
39                                                <- Number of decision tables
 NAME   	 CONDS	ALTS	ACTS
 hay_fesc          2          1          1    <- Decision table header (indexed as main record)
 VAR		OBJ	OB_NUM	LIM_VAR		LIM_OP	   LIM_CONST	 ALT1   <- Conditions section header (skipped)
 biomass   hru          0    null      -      2000     >   <- Condition line 1 (skipped)
 phu_plant   hru          0    null      -       0.5    >=   <- Condition line 2 (skipped)
 ACT_TYP    OBJ OBJ_NUM   NAME       OPTION       CONST         CONST2      FP     OUTCOMES  <- Actions section header (skipped)
 harvest   hru       0 hay_harv       fesc     0      3  hay_cut_low     y  <- Action line (FK tracked: hay_cut_low → harv.ops)
```

### 5. Implementation Details

#### Key Methods

**`isHierarchicalFile(fileName: string): boolean`**
- Checks if a file is configured as hierarchical
- Uses metadata configuration

**`isMainRecordLine(valueMap, fileName, headers): boolean`**
- Applies file-specific heuristics
- Returns true if line is a main record (should be indexed)
- Returns false if line is a child line (should be skipped)

**`getChildLineCount(valueMap, config, fileName): number`**
- Extracts explicit child count from configured field OR uses fixed count
- Checks `child_line_count_fixed` first (for files like weather-wgn.cli)
- Falls back to parsing field value for dynamic counts
- Supports multi-field syntax (e.g., "numb_auto+numb_ops") to sum multiple fields
- Validates count (negative/excessive values)
- Returns 0 if no explicit count available

**Multi-Field Count Support:**
```typescript
// Configuration in metadata
"child_line_count_field": "numb_auto+numb_ops"

// Implementation sums both fields
const fields = countField.split('+');  // ["numb_auto", "numb_ops"]
let totalCount = 0;
for (const field of fields) {
    totalCount += parseInt(valueMap[field], 10) || 0;
}
```

**Operation Type to File Mappings (management.sch):**
```typescript
const opTypeToTable = {
    'plnt': 'plant_ini',    // Plant community reference
    'harv': 'harv_ops',     // Harvest operation
    'hvkl': 'plant_ini',    // Harvest and kill
    'kill': 'plant_ini',    // Kill plant
    'till': 'tillage_til',  // Tillage operation
    'irrm': 'irr_ops',      // Irrigation (moisture-based)
    'irra': 'irr_ops',      // Irrigation (auto)
    'fert': 'fertilizer_frt', // Fertilizer application
    'frta': 'fertilizer_frt', // Fertilizer (auto)
    'frtc': 'fertilizer_frt', // Fertilizer (continuous)
    'pest': 'pesticide_pes',  // Pesticide application
    'pstc': 'pesticide_pes',  // Pesticide (continuous)
    'graz': 'graze_ops'       // Grazing operation
};
```

**Modified `indexTable()` Loop**
```typescript
// Determine skip strategy
if (explicitCount > 0) {
    // Strategy 2: Skip N lines after main record
    skipCount = explicitCount;
} else {
    // Strategy 1: Check each line individually
    if (!isMainRecordLine(...)) {
        i++;
        continue; // Skip this child line
    }
}

// ... process main record ...

// Apply skip count if set
i += skipCount;
```

### 4. Constants

**`NUMERIC_VALUE_PATTERN = /^\d+(\.\d+)?$/`**
- Shared regex for detecting numeric values
- Used in both main code and tests

**`DEBUG_OUTPUT_LINE_LIMIT = 10`**
- Limits debug logging to first 10 child lines
- Prevents log spam for large files

## Testing

### Unit Tests (`src/test/hierarchical.test.ts`)

1. **Main record detection**: Validates regex pattern for numeric vs text values
2. **Child line count parsing**: Tests plnt_cnt field parsing and validation
3. **Hierarchical file detection**: Verifies file classification logic

### Manual Testing

Create test files in `/tmp/swat-test-fixtures/`:
- `soils.sol` with layer data
- `plant.ini` with plant details

Run indexer and verify:
- Only main records are indexed
- Child lines are skipped
- Navigation works correctly

## Benefits

1. **Correct Indexing**: Only soil types/plant communities are indexed as FK targets, not layer/detail data
2. **Performance**: Reduced index size by skipping irrelevant lines
3. **Navigation**: Ctrl+Click on FK values navigates to main record, not child data
4. **Validation**: FK checks work against actual main records

## Limitations & Future Work

1. **soils.sol**: Layer count not explicitly stored; relies on heuristic detection
2. **Decision tables**: Conservative approach (doesn't currently skip lines)
3. **New formats**: Must be manually added to metadata configuration
4. **Layer navigation**: Cannot currently navigate to specific soil layers (only main record)

## Important Implementation Details

### Column Mismatch Handling

Hierarchical files like `soils.sol` have a unique structure where:
- The header line combines columns from BOTH main records AND child records
- Main record lines have fewer columns than the header (only main record fields)
- Child lines have different columns than the header (only layer fields)

**Example from soils.sol:**
```
name       nly  hyd_grp  dp_tot  anion_excl  perc_crk  texture  dp     bd    awc   ...
PadHOEGOG  5    C        1000.0  0.5         0.5       LS                              <- Main record (7 fields)
                                                                170.0  1.29  0.135 ... <- Child line (layer fields)
```

The indexer handles this by:
1. **Skipping column count validation for hierarchical files**: Allows lines with fewer columns than headers
2. **Using heuristic detection**: Determines main vs child based on content, not column count
3. **Mapping available values**: Only maps as many values as are present in the line

This fix was critical - the original code was rejecting main record lines as "malformed" due to having fewer columns than the header, preventing proper indexing of soil types.

## Code Quality

- TypeScript type safety with proper null handling
- ESLint compliant
- CodeQL security scan: 0 alerts
- Extracted constants to eliminate duplication
- Comprehensive inline documentation

## References

- Problem Statement: Issue about soils.sol multi-line structure
- Documentation: `docs/ENHANCED_INDEXING.md` (Hierarchical File Support section)
- Configuration: `resources/schema/txtinout-metadata.json` (hierarchical_files section)
- Tests: `src/test/hierarchical.test.ts`
