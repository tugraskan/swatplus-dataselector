# SWAT+ Data Parsing Implementation

## Overview

SWAT+ input files are **whitespace-delimited text files** with variable spacing between columns. The parsing system is designed to be robust and handle various whitespace configurations while maintaining data integrity.

## File Format

### Standard File Structure

```
Title or Metadata Line (optional)
column1    column2    column3    column4
value1     value2     value3     value4
value5     value6     value7     value8
```

**Format Specifications:**
- **Line 0 (optional):** Metadata or title line (if `has_metadata_line` is true in schema)
- **Line 1:** Header line with column names separated by whitespace
- **Line 2+:** Data rows with values separated by whitespace
- **Whitespace:** Can be spaces, tabs, or mixed; amount can vary between columns
- **Alignment:** Columns may or may not be visually aligned

### Example Files

#### Regular File (hru-data.hru)
```
Hydrological Response Units
name    topo         hydro        soil         lu_mgt
hru_1   topo_default hydro_clay   clay_loam    corn_rot
hru_2   topo_steep   hydro_sand   sandy_loam   forest
```

#### Hierarchical File (soils.sol)
```
Soil Properties
name         hyd_grp   dp_tot    description
clay_loam    C         1500.0    Clay loam soil
150.0        1.35      0.18      10.5         <- layer 1 (child line)
300.0        1.40      0.16      8.5          <- layer 2 (child line)
sandy_loam   B         1200.0    Sandy loam   <- main record
200.0        1.50      0.12      15.0         <- layer 1 (child line)
```

## Parsing Algorithm

### 1. Header Parsing

```typescript
const headerLine = lines[headerLineIndex];
const headers = headerLine.trim().split(/\s+/).filter(h => h.length > 0);
```

**Steps:**
1. Trim leading/trailing whitespace from header line
2. Split on any whitespace (one or more spaces/tabs): `/\s+/`
3. Filter out empty strings to handle edge cases

**Why Filter?**
- Splitting `"  a  b  c"` on `/\s+/` produces `["", "a", "b", "c"]`
- Filtering removes the empty string to get `["a", "b", "c"]`
- This prevents column misalignment

### 2. Data Line Parsing

```typescript
const line = lines[i].trim();
const values = line.split(/\s+/).filter(v => v.length > 0);
```

**Steps:**
1. Trim leading/trailing whitespace from data line
2. Split on any whitespace: `/\s+/`
3. Filter out empty strings
4. Each value is already trimmed (no need for `.map(v => v.trim())`)

### 3. Value Mapping

```typescript
const valueMap: { [key: string]: string } = {};
for (let j = 0; j < headers.length && j < values.length; j++) {
    valueMap[headers[j]] = values[j].trim();
}

// Fill in missing columns with empty strings
for (let j = values.length; j < headers.length; j++) {
    valueMap[headers[j]] = '';
}
```

**Steps:**
1. Map each value to its corresponding header
2. Additional `.trim()` call is defensive (values are already trimmed)
3. Fill missing columns with empty strings for incomplete rows

## Whitespace Handling

### Supported Formats

The parser handles all of these variations:

```
# Normal spacing
name    topo         hydro
hru_1   topo_default hydro_clay

# Extra spaces
name        topo             hydro
hru_1       topo_default     hydro_clay

# Tab-separated
name	topo	hydro
hru_1	topo_default	hydro_clay

# Mixed whitespace
name  	  topo      	hydro
hru_1	topo_default  	hydro_clay

# Leading whitespace (trimmed)
  name    topo         hydro
  hru_1   topo_default hydro_clay
```

### Edge Cases Handled

1. **Empty values in the middle:** Represented as missing columns or null sentinels
2. **Extra columns:** Logged as warnings, extra values ignored
3. **Missing columns:** Filled with empty strings
4. **Inconsistent spacing:** Normalized during parsing
5. **Leading/trailing whitespace:** Trimmed before splitting

## Null Value Handling

### Null Sentinels

Values that represent "no reference" in foreign key relationships:
- `"null"` (case-insensitive: "NULL", "Null", "null")
- `"0"`
- `""` (empty string)

### Robust Null Checking

```typescript
private isFKNullValue(value: string): boolean {
    if (!value) {
        return true;
    }
    const trimmedValue = value.trim().toLowerCase();
    return this.fkNullValues.some(nullVal => 
        trimmedValue === nullVal.toLowerCase()
    );
}
```

**Features:**
- Case-insensitive comparison
- Whitespace trimming before comparison
- Handles `" null "`, `"NULL"`, `"Null"`, etc.

## Error Handling

### Malformed Lines

When a line has fewer values than headers:

```
[Indexer] Malformed line 5 in hru-data.hru: expected 5 columns, got 3
[Indexer]   Headers: [name, topo, hydro, soil, lu_mgt]
[Indexer]   Values: [hru_1, topo_default, hydro_clay]
```

**Action:** Line is skipped, error is logged

### Extra Columns

When a line has more values than headers:

```
[Indexer] Line 5 in hru-data.hru has more values (6) than headers (5)
[Indexer]   Extra values will be ignored: [extra_value]
```

**Action:** Extra values are ignored, warning is logged (only first 3 occurrences)

## Hierarchical File Handling

Some files have multi-line records (see [ENHANCED_INDEXING.md](ENHANCED_INDEXING.md) for details):

- **soils.sol:** Soil properties with layer data
- **plant.ini:** Plant communities with plant details
- **management.sch:** Management schedules with operations
- **Decision tables (*.dtl):** Complex multi-section structure

**Strategy:**
1. Detect hierarchical files from metadata
2. Index only main records
3. Skip child lines based on heuristics or explicit counts
4. Track foreign keys in child lines for management.sch and DTL files

## Best Practices

### For SWAT+ File Authors

1. **Use consistent whitespace:** Tabs or spaces, but be consistent
2. **Align columns visually:** Makes files easier to read (optional)
3. **No leading/trailing spaces:** Parser handles them, but avoid for clarity
4. **Use null sentinels:** Use "null" or "0" for empty references, not blank spaces
5. **Complete rows:** Provide all columns even if some values are null

### For Extension Developers

1. **Always trim before splitting:** Handles leading/trailing whitespace
2. **Filter after splitting:** Removes empty strings from split results
3. **Defensive trimming:** Extra `.trim()` calls don't hurt
4. **Log parsing issues:** Help users identify malformed files
5. **Be lenient:** Fill missing columns, warn about extras

## Comparison with Other Approaches

### Current Approach: String Splitting

**Pros:**
- Simple and fast
- No external dependencies
- Handles variable whitespace well
- TypeScript native

**Cons:**
- Manual parsing logic
- Edge cases require careful handling
- No built-in CSV/TSV support

### Alternative: Pandas (Python)

**Pros:**
- Battle-tested CSV/TSV parsing
- Automatic type inference
- Rich data manipulation

**Cons:**
- Requires Python runtime
- Adds dependency
- Overkill for simple parsing
- Not native to TypeScript/VS Code

### Alternative: Papa Parse (JavaScript)

**Pros:**
- Robust CSV/TSV parsing
- Handles edge cases
- TypeScript support

**Cons:**
- Adds dependency (270KB)
- SWAT+ files aren't strictly CSV/TSV
- More complex than needed

### Decision: Stick with String Splitting

The current approach is appropriate because:
1. SWAT+ files are simple whitespace-delimited
2. No complex quoting or escaping
3. Performance is excellent
4. No external dependencies
5. Full control over parsing logic

## Testing

### Manual Testing

To verify parsing works correctly:

1. Create test files with various whitespace patterns
2. Build index and check console output
3. Verify FK resolution works
4. Test navigation (Ctrl+Click)

### Example Test File

```
Test File
name    value1    value2
test1   abc       def
test2	ghi	jkl
  test3  mno  pqr
test4       stu       vwx
```

Expected: All 4 rows parsed correctly despite varying whitespace.

## Troubleshooting

### FK References Not Resolving

**Symptoms:** Unresolved FK warnings in console

**Debug:**
1. Check console output for byte-level comparison
2. Look for whitespace in PK values: `"name " vs "name"`
3. Check case sensitivity: `"Name" vs "name"`
4. Verify null sentinels: `"null"` vs `"NULL"`

**Solution:** The robust null checking should handle most cases

### Column Misalignment

**Symptoms:** Values mapped to wrong columns

**Debug:**
1. Check warning messages about column counts
2. Verify header line has correct column count
3. Look for missing or extra values in data lines

**Solution:** Fix the input file or adjust schema

### Performance Issues

**Symptoms:** Slow indexing with large files

**Debug:**
1. Check file sizes (MB range is normal)
2. Look for files with 10,000+ rows
3. Profile with console timings

**Solution:** Current approach is fast enough; no optimization needed unless files exceed 100K rows

## Future Enhancements

Potential improvements for consideration:

1. **Streaming parser:** For very large files (>100MB)
2. **Column type validation:** Detect numeric/string/date types
3. **Smart delimiter detection:** Auto-detect tabs vs spaces
4. **Fixed-width support:** Parse files with aligned columns by position
5. **Encoding detection:** Handle UTF-8, ASCII, Latin-1 automatically

Currently, none of these are necessary for typical SWAT+ datasets.
