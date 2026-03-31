import * as assert from 'assert';
import { shouldSuppressUnresolvedFkDiagnostic } from '../fkDiagnosticsUtils';
import type { FKReference } from '../indexer';

suite('FK Diagnostics Utils', () => {
    const metadata = {
        file_pointer_columns: {
            'weather-sta.cli': {
                tmp: {
                    description: 'Temperature data file name',
                    file_pattern: '*.tmp'
                },
                wgn: 'Name of the weather generator station'
            }
        }
    };

    test('suppresses unresolved FK diagnostics for file-pointer-like weather filenames', () => {
        const ref: FKReference = {
            sourceFile: 'C:\\dataset\\TxtInOut\\weather-sta.cli',
            sourceTable: 'weather_sta_cli',
            sourceLine: 4,
            sourceColumn: 'tmp',
            fkValue: 'ames.tem',
            fkValueLower: 'ames.tem',
            targetTable: 'tmp_cli',
            targetColumn: 'name',
            resolved: false
        };

        assert.strictEqual(shouldSuppressUnresolvedFkDiagnostic(ref, metadata), true);
    });

    test('does not suppress normal unresolved foreign keys', () => {
        const ref: FKReference = {
            sourceFile: 'C:\\dataset\\TxtInOut\\weather-sta.cli',
            sourceTable: 'weather_sta_cli',
            sourceLine: 4,
            sourceColumn: 'wgn',
            fkValue: 'ames_wgn',
            fkValueLower: 'ames_wgn',
            targetTable: 'weather_wgn_cli',
            targetColumn: 'name',
            resolved: false
        };

        assert.strictEqual(shouldSuppressUnresolvedFkDiagnostic(ref, metadata), false);
    });

    test('suppresses unresolved diagnostics for recall.rec file pointers', () => {
        const recallMetadata = {
            file_pointer_columns: {
                'recall.rec': {
                    file: {
                        description: 'Recall time series data file name',
                        file_pattern: '*.rec'
                    }
                }
            }
        };

        const ref: FKReference = {
            sourceFile: 'C:\\dataset\\TxtInOut\\recall.rec',
            sourceTable: 'recall_rec',
            sourceLine: 4,
            sourceColumn: 'file',
            fkValue: 'pt001.rec',
            fkValueLower: 'pt001.rec',
            targetTable: 'recall_file',
            targetColumn: 'name',
            resolved: false
        };

        assert.strictEqual(shouldSuppressUnresolvedFkDiagnostic(ref, recallMetadata), true);
    });
});
