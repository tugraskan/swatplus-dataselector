import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('SWAT+ Database Navigation Test Suite', () => {
    // Use a conditional path that works on different systems
    const testDataPath = process.env.SWAT_TEST_DATA || '/tmp/swat_test_dataset';
    
    test('Test dataset files exist', function() {
        // Skip test if test data directory doesn't exist
        if (!fs.existsSync(testDataPath)) {
            this.skip();
            return;
        }
        
        assert.ok(fs.existsSync(path.join(testDataPath, 'hru.hru')));
        assert.ok(fs.existsSync(path.join(testDataPath, 'hydrology.hru')));
        assert.ok(fs.existsSync(path.join(testDataPath, 'topography.hru')));
        assert.ok(fs.existsSync(path.join(testDataPath, 'field.hru')));
    });
    
    test('HRU file has expected structure', function() {
        if (!fs.existsSync(testDataPath)) {
            this.skip();
            return;
        }
        
        const hruPath = path.join(testDataPath, 'hru.hru');
        const content = fs.readFileSync(hruPath, 'utf8');
        const lines = content.split('\n');
        
        // Should have header + data lines
        assert.ok(lines.length > 1, 'HRU file should have multiple lines');
        
        // Check header
        assert.ok(lines[0].includes('name'), 'First line should be header with "name"');
        assert.ok(lines[0].includes('hydrology'), 'Header should include "hydrology"');
        assert.ok(lines[0].includes('topography'), 'Header should include "topography"');
        
        // Check data line
        const dataLine = lines[1].trim();
        const fields = dataLine.split(/\s+/);
        assert.ok(fields.length >= 3, 'Data line should have at least 3 fields');
        assert.ok(fields[0].startsWith('hru_'), 'First field should be HRU name');
        assert.ok(fields[1].startsWith('hydro_'), 'Second field should be hydrology reference');
        assert.ok(fields[2].startsWith('topo_'), 'Third field should be topography reference');
    });
    
    test('Hydrology file has expected structure', function() {
        if (!fs.existsSync(testDataPath)) {
            this.skip();
            return;
        }
        
        const hydroPath = path.join(testDataPath, 'hydrology.hru');
        const content = fs.readFileSync(hydroPath, 'utf8');
        const lines = content.split('\n');
        
        // Should have header + data lines
        assert.ok(lines.length > 1, 'Hydrology file should have multiple lines');
        
        // Check data line
        const dataLine = lines[1].trim();
        const fields = dataLine.split(/\s+/);
        assert.ok(fields[0].startsWith('hydro_'), 'First field should be hydrology name');
    });
    
    test('Foreign key references are valid', function() {
        if (!fs.existsSync(testDataPath)) {
            this.skip();
            return;
        }
        
        const hruPath = path.join(testDataPath, 'hru.hru');
        const hydroPath = path.join(testDataPath, 'hydrology.hru');
        
        // Read HRU file
        const hruContent = fs.readFileSync(hruPath, 'utf8');
        const hruLines = hruContent.split('\n').slice(1); // Skip header
        
        // Read hydrology file
        const hydroContent = fs.readFileSync(hydroPath, 'utf8');
        const hydroLines = hydroContent.split('\n').slice(1); // Skip header
        
        // Get hydrology names
        const hydroNames = hydroLines
            .filter(line => line.trim())
            .map(line => line.trim().split(/\s+/)[0]);
        
        // Check that HRU references exist in hydrology
        for (const hruLine of hruLines) {
            if (!hruLine.trim()) {
                continue;
            }
            const fields = hruLine.trim().split(/\s+/);
            if (fields.length < 2) {
                continue;
            }
            
            const hydroRef = fields[1]; // Column 1 is hydrology reference
            // Note: Some HRU entries may reference the same hydrology multiple times
            // We just verify the reference format is correct
            if (hydroRef.startsWith('hydro_')) {
                assert.ok(
                    hydroNames.some(name => name === hydroRef),
                    `HRU references hydrology "${hydroRef}" which should exist in hydrology.hru`
                );
            }
        }
    });
});
