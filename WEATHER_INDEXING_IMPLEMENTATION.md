# Weather Climate File Indexing Implementation

## Summary

This implementation adds support for indexing weather climate files (`weather-sta.cli` and `weather-wgn.cli`) in the SWAT+ Dataset Selector extension. The key change is treating `weather-wgn.cli` as a hierarchical file with a fixed child line count.

## Problem Statement

The `weather-wgn.cli` file has a multi-structured format where each weather station record consists of:
1. **Main record line**: Contains station name, latitude, longitude, elevation, and rain_yrs
2. **Header line**: Column names for monthly data (tmp_max_ave, tmp_min_ave, etc.)
3. **12 monthly data lines**: One line per month with climate statistics

Example:
```
weather-wgn.cli: written by SWAT+ editor v2.2.0 on 2023-03-22 04:25 for SWAT+ rev.60.5.4
name                           lat          lon         elev      rain_yrs
Imsil                        35.61       127.29       247.90            51
 tmp_max_ave tmp_min_ave tmp_max_sd tmp_min_sd pcp_ave pcp_sd pcp_skew wet_dry wet_wet pcp_days  pcp_hhr slr_ave dew_ave wnd_ave
       -0.64      -10.50        4.19       3.30   25.40   5.08     0.82    0.28    0.43     8.93 7.394878   11.30   -7.16    2.50
        2.86       -7.54        4.41       3.41   31.75   6.35     0.99    0.27    0.42     8.46 7.846535   13.90   -5.23    2.65
... (10 more monthly data lines)
me170814                     45.67       -69.82      323.10            51
 tmp_max_ave tmp_min_ave ...
...
```

Without proper handling, the indexer would treat each line as a separate record, creating incorrect index entries for the header and monthly data lines.

## Solution

### 1. Metadata Configuration

Added `weather-wgn.cli` to the `hierarchical_files` section in `resources/schema/txtinout-metadata.json`:

```json
"weather-wgn.cli": {
  "description": "Weather generator parameters with main station record followed by 12 monthly data lines",
  "structure": {
    "main_record_format": "Main line contains station name, lat, lon, elev, and rain_yrs",
    "child_line_format": "Following 13 lines: 1 header line + 12 monthly data lines (one per month)",
    "main_record_identifier": "First data field is the station name (primary key)",
    "child_line_count_field": null,
    "child_line_count_fixed": 13,
    "indexing_strategy": "Index only the main record line; skip 1 header line + 12 monthly data lines"
  }
}
```

Key features:
- `child_line_count_fixed: 13`: Specifies that each station record has exactly 13 child lines to skip
- This is the first file to use the fixed child count strategy (vs. dynamic count from a field)

### 2. Indexer Updates

Modified `src/indexer.ts` to support fixed child line counts:

#### Interface Update
```typescript
interface HierarchicalFileConfig {
    description: string;
    structure: {
        main_record_format: string;
        child_line_format: string;
        main_record_identifier: string | null;
        child_line_count_field?: string | null;
        child_line_count_fixed?: number;  // NEW: Support for fixed counts
        indexing_strategy: string;
    };
}
```

#### Logic Update in `getChildLineCount()` method
```typescript
private getChildLineCount(valueMap: { [key: string]: string }, config: HierarchicalFileConfig, fileName: string): number {
    // Check if there's a fixed child line count first
    const fixedCount = config.structure.child_line_count_fixed;
    if (fixedCount !== undefined && fixedCount !== null) {
        // Validation and sanity checks...
        return fixedCount;
    }
    
    // Falls back to existing field-based or heuristic logic
    // ...
}
```

The method now:
1. Checks for `child_line_count_fixed` first
2. Returns the fixed count if present (with validation)
3. Falls back to existing field-based counting for other files

### 3. Documentation

Updated `HIERARCHICAL_FILES_IMPLEMENTATION.md` to document:
- Weather-wgn.cli as a hierarchical file type
- Strategy 2b: Fixed Child Count pattern
- Example of weather-wgn.cli structure
- Updated method descriptions

### 4. Testing

Updated `src/test/hierarchical.test.ts`:
- Added `weather-wgn.cli` to the list of hierarchical files
- Ensures the file is properly detected as hierarchical

Created test data in `/tmp/swat-test-data/`:
- `weather-wgn.cli`: Sample file with 2 weather stations
- `weather-sta.cli`: Sample file referencing the weather stations

## Impact

### What This Fixes

1. **Correct Indexing**: Only station records (e.g., "Imsil", "me170814") are indexed, not header or monthly data lines
2. **FK Resolution**: Weather station references in `weather-sta.cli` can now properly resolve to weather generator stations
3. **Navigation**: Ctrl+Click on weather generator references navigates to the correct station record

### Example FK Chain

With these changes, the following FK chain now works:
```
weather-sta.cli (station s35610n127290e)
  └─ wgn: "Imsil" → weather-wgn.cli (Imsil station record)
  └─ pcp: "Imsilpcp.pcp" → Imsilpcp.pcp file
  └─ tmp: "Imsiltmp.tmp" → Imsiltmp.tmp file
  └─ slr: "Imsilsol.slr" → Imsilsol.slr file
  └─ wnd: "Imsilwind.wnd" → Imsilwind.wnd file
```

## Files Changed

1. `resources/schema/txtinout-metadata.json`
   - Added weather-wgn.cli hierarchical configuration

2. `src/indexer.ts`
   - Added `child_line_count_fixed` to HierarchicalFileConfig interface
   - Updated `getChildLineCount()` to check for fixed count first

3. `HIERARCHICAL_FILES_IMPLEMENTATION.md`
   - Documented weather-wgn.cli as hierarchical file
   - Added Strategy 2b: Fixed Child Count section
   - Updated method documentation

4. `src/test/hierarchical.test.ts`
   - Added weather-wgn.cli to hierarchical file detection test

## Future Considerations

### Weather Data Files

The actual weather data files (e.g., `Imsilpcp.pcp`, `Imsiltmp.tmp`) also have a hierarchical structure:
- Line 1: Metadata/title
- Line 2: Header (nbyr, tstep, lat, lon, elev)
- Line 3: Station metadata
- Line 4+: Time series data (year, month, value)

Currently, these are indexed with the standard approach. If needed, they could be configured as hierarchical files with a variable child count based on the `nbyr` field (number of years of data).

### Testing

While test data was created, integration testing with the actual VSCode extension would be beneficial to verify:
- Indexing builds successfully for weather files
- FK navigation works correctly
- Hover tooltips display properly

## References

- **Problem Statement**: Issue request to index weather-sta.cli and weather-wgn.cli
- **SWAT+ Documentation**: 
  - https://swatplus.gitbook.io/io-docs/introduction-1/climate
  - https://swatplus.gitbook.io/io-docs/introduction-1/climate/weather-sta.cli
  - https://swatplus.gitbook.io/io-docs/introduction-1/climate/weather-wgn.cli
- **Implementation Guide**: HIERARCHICAL_FILES_IMPLEMENTATION.md
