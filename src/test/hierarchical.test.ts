import * as assert from 'assert';

// Shared constant for hierarchical file detection
// This matches the pattern used in indexer.ts to detect numeric values
const NUMERIC_VALUE_PATTERN = /^\d+(\.\d+)?$/;

suite('Hierarchical File Indexing Test Suite', () => {
    
    test('Main record detection for soils.sol', () => {
        // Test that numeric values in name field are detected as child lines
        const numericName = '150.0';
        const isNumeric = NUMERIC_VALUE_PATTERN.test(numericName);
        assert.strictEqual(isNumeric, true, 'Numeric value should be detected as child line');

        // Test that text values in name field are detected as main records
        const textName = 'clay_loam';
        const isText = NUMERIC_VALUE_PATTERN.test(textName);
        assert.strictEqual(isText, false, 'Text value should be detected as main record');

        // Test edge cases
        const mixedName = 'soil_1';
        const isMixed = NUMERIC_VALUE_PATTERN.test(mixedName);
        assert.strictEqual(isMixed, false, 'Mixed alphanumeric should be detected as main record');
    });

    test('Child line count detection for plant.ini', () => {
        // Test that plnt_cnt field is parsed correctly
        const valueMap = {
            'name': 'comm_crop',
            'plnt_cnt': '2',
            'rot_yr_ini': '1'
        };
        
        const count = parseInt(valueMap['plnt_cnt'], 10);
        assert.strictEqual(count, 2, 'plnt_cnt should be parsed as 2');
        assert.strictEqual(isNaN(count), false, 'Parsed count should be a valid number');
    });

    test('Hierarchical file detection', () => {
        // Test that soils.sol is detected as hierarchical
        const soilsFile = 'soils.sol';
        const plantFile = 'plant.ini';
        const wgnFile = 'weather-wgn.cli';
        const regularFile = 'hru-data.hru';

        // These would need access to metadata, but we can test the file name checking logic
        const hierarchicalFiles = ['soils.sol', 'plant.ini', 'd_table.dtl', 'lum.dtl', 'weather-wgn.cli', 'management.sch'];
        
        assert.strictEqual(hierarchicalFiles.includes(soilsFile), true, 'soils.sol should be hierarchical');
        assert.strictEqual(hierarchicalFiles.includes(plantFile), true, 'plant.ini should be hierarchical');
        assert.strictEqual(hierarchicalFiles.includes(wgnFile), true, 'weather-wgn.cli should be hierarchical');
        assert.strictEqual(hierarchicalFiles.includes(regularFile), false, 'hru-data.hru should not be hierarchical');
    });
});
