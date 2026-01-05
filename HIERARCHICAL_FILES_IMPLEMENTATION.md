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
- **Decision tables (*.dtl)**: Condition-action pairs

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

### 3. Implementation Details

#### Key Methods

**`isHierarchicalFile(fileName: string): boolean`**
- Checks if a file is configured as hierarchical
- Uses metadata configuration

**`isMainRecordLine(valueMap, fileName, headers): boolean`**
- Applies file-specific heuristics
- Returns true if line is a main record (should be indexed)
- Returns false if line is a child line (should be skipped)

**`getChildLineCount(valueMap, config, fileName): number`**
- Extracts explicit child count from configured field
- Validates count (negative/excessive values)
- Returns 0 if no explicit count available

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
