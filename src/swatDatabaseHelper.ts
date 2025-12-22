import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Helper class to query SWAT+ project database for foreign key relationships
 */
export class SwatDatabaseHelper {
    private sqlite3: any;
    
    constructor() {
        // Lazy load sqlite3 to avoid issues if it's not installed
        try {
            this.sqlite3 = require('better-sqlite3');
        } catch (e) {
            // SQLite not available - features will be disabled
            this.sqlite3 = null;
            console.warn('better-sqlite3 not available. Database navigation will use file-based fallback only.');
        }
    }

    /**
     * Check if SQLite is available
     */
    isAvailable(): boolean {
        return this.sqlite3 !== null;
    }

    /**
     * Get the project.db path for a given dataset folder
     */
    getProjectDbPath(datasetPath: string): string | undefined {
        const dbPath = path.join(datasetPath, 'project.db');
        if (fs.existsSync(dbPath)) {
            return dbPath;
        }
        return undefined;
    }

    /**
     * Validate table name to prevent SQL injection
     * Only allows alphanumeric characters and underscores, starting with a letter
     */
    private isValidTableName(tableName: string): boolean {
        // Must start with a letter, followed by alphanumeric or underscore
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(tableName);
    }

    /**
     * Validate column name to prevent SQL injection
     * Only allows alphanumeric characters and underscores, starting with a letter
     */
    private isValidColumnName(columnName: string): boolean {
        // Must start with a letter, followed by alphanumeric or underscore
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(columnName);
    }

    /**
     * Resolve a foreign key reference to get the target table and record
     * @param dbPath Path to project.db
     * @param sourceTable Source table name (e.g., 'hru_data_hru')
     * @param sourceColumn Source column name (e.g., 'hydro')
     * @param sourceValue Value of the foreign key (id)
     * @returns Object with target table name, record data, and file info
     */
    resolveForeignKey(dbPath: string, sourceTable: string, sourceColumn: string, sourceValue: string | number): any {
        if (!this.sqlite3) {
            return null;
        }

        // Validate inputs to prevent SQL injection
        if (!this.isValidTableName(sourceTable) || !this.isValidColumnName(sourceColumn)) {
            console.error('Invalid table or column name');
            return null;
        }

        try {
            const db = this.sqlite3(dbPath, { readonly: true, fileMustExist: true });
            
            // Get foreign key information from schema
            const pragmaStmt = db.prepare(`PRAGMA foreign_key_list(${sourceTable})`);
            const foreignKeys = pragmaStmt.all();
            
            // Find the foreign key for this column
            const fk = foreignKeys.find((fkey: any) => fkey.from === sourceColumn);
            if (!fk) {
                db.close();
                return null;
            }

            const targetTable = fk.table;
            const targetColumn = fk.to || 'id';

            // Validate target table name
            if (!this.isValidTableName(targetTable) || !this.isValidColumnName(targetColumn)) {
                db.close();
                return null;
            }

            // Query the target table for the record
            const query = `SELECT * FROM ${targetTable} WHERE ${targetColumn} = ?`;
            const stmt = db.prepare(query);
            const record = stmt.get(sourceValue);
            
            db.close();

            if (record) {
                return {
                    targetTable,
                    targetColumn,
                    record,
                    fileName: this.getFileNameForTable(targetTable)
                };
            }

            return null;
        } catch (error) {
            console.error('Error resolving foreign key:', error);
            return null;
        }
    }

    /**
     * Find a record by name in a table
     * @param dbPath Path to project.db
     * @param tableName Table to search
     * @param recordName Name to search for
     * @returns Record data if found
     */
    findRecordByName(dbPath: string, tableName: string, recordName: string): any {
        if (!this.sqlite3) {
            return null;
        }

        // Validate table name to prevent SQL injection
        if (!this.isValidTableName(tableName)) {
            console.error('Invalid table name');
            return null;
        }

        try {
            const db = this.sqlite3(dbPath, { readonly: true, fileMustExist: true });
            
            // Try to find by name column
            const query = `SELECT * FROM ${tableName} WHERE name = ? LIMIT 1`;
            const stmt = db.prepare(query);
            const record = stmt.get(recordName);
            
            db.close();
            return record;
        } catch (error) {
            console.error('Error finding record by name:', error);
            return null;
        }
    }

    /**
     * Map table names to their corresponding file names
     */
    private getFileNameForTable(tableName: string): string {
        const tableToFileMap: { [key: string]: string } = {
            'hydrology_hyd': 'hydrology.hyd',
            'topography_hyd': 'topography.hyd',
            'field_fld': 'field.fld',
            'soils_sol': 'soils.sol',
            'landuse_lum': 'landuse.lum',
            'soil_plant_ini': 'soil_plant.ini',
            'wetland_wet': 'wetland.wet',
            'snow_sno': 'snow.sno',
            'hru_data_hru': 'hru-data.hru',
            'hru_lte_hru': 'hru-lte.hru',
            'plants_plt': 'plants.plt',
            'd_table_dtl': 'd_table.dtl',
            'soils_lte_sol': 'soils_lte.sol',
            'aquifer_aqu': 'aquifer.aqu',
            'initial_aqu': 'initial.aqu'
        };

        return tableToFileMap[tableName.toLowerCase()] || `${tableName}.txt`;
    }

    /**
     * Get the table name for a given file
     */
    getTableNameForFile(fileName: string): string | undefined {
        const fileToTableMap: { [key: string]: string } = {
            'hru-data.hru': 'hru_data_hru',
            'hru-lte.hru': 'hru_lte_hru',
            'hydrology.hyd': 'hydrology_hyd',
            'topography.hyd': 'topography_hyd',
            'field.fld': 'field_fld',
            'soils.sol': 'soils_sol',
            'landuse.lum': 'landuse_lum',
            'soil_plant.ini': 'soil_plant_ini',
            'wetland.wet': 'wetland_wet',
            'snow.sno': 'snow_sno',
            'plants.plt': 'plants_plt',
            'd_table.dtl': 'd_table_dtl',
            'soils_lte.sol': 'soils_lte_sol',
            'aquifer.aqu': 'aquifer_aqu',
            'initial.aqu': 'initial_aqu'
        };

        return fileToTableMap[fileName.toLowerCase()];
    }

    /**
     * Get foreign key columns for a table
     */
    getForeignKeyColumns(dbPath: string, tableName: string): string[] {
        if (!this.sqlite3) {
            return [];
        }

        // Validate table name to prevent SQL injection
        if (!this.isValidTableName(tableName)) {
            console.error('Invalid table name');
            return [];
        }

        try {
            const db = this.sqlite3(dbPath, { readonly: true, fileMustExist: true });
            const pragmaStmt = db.prepare(`PRAGMA foreign_key_list(${tableName})`);
            const foreignKeys = pragmaStmt.all();
            db.close();

            return foreignKeys.map((fk: any) => fk.from);
        } catch (error) {
            console.error('Error getting foreign keys:', error);
            return [];
        }
    }

    /**
     * Get list of all tables in the database
     */
    getAvailableTables(dbPath: string): string[] {
        if (!this.sqlite3) {
            return [];
        }

        try {
            const db = this.sqlite3(dbPath, { readonly: true, fileMustExist: true });
            const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
            const tables = stmt.all();
            db.close();

            return tables.map((t: any) => t.name);
        } catch (error) {
            console.error('Error getting tables:', error);
            return [];
        }
    }

    /**
     * Check if a table exists in the database
     */
    tableExists(dbPath: string, tableName: string): boolean {
        if (!this.sqlite3) {
            return false;
        }

        // Validate table name first
        if (!this.isValidTableName(tableName)) {
            return false;
        }

        try {
            const db = this.sqlite3(dbPath, { readonly: true, fileMustExist: true });
            const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
            const result = stmt.get(tableName);
            db.close();

            return !!result;
        } catch (error) {
            console.error('Error checking table existence:', error);
            return false;
        }
    }
}
