/**
 * DatasetModel backed by a pandas-indexer index file (vscode-free).
 *
 * Loads the JSON produced by `scripts/pandas_indexer.py`
 * (`{ tables, fkReferences, fileTableMap }`) plus a schema document (for FK
 * edges), and exposes it through the {@link DatasetModel} contract. This lets the
 * engine run outside the extension — e.g. from the MCP server or tests — against
 * a real indexed dataset.
 */

import {
    DatasetModel,
    EngineRow,
    FkEdge,
    IncomingReference,
    scanIncomingReferences,
    mergeIncomingReferences,
    ENTITY_FILE_ALIASES,
} from './datasetEngineCore';

interface IndexRow {
    file: string;
    tableName: string;
    lineNumber: number;
    pkValue: string;
    pkValueLower?: string;
    values: { [column: string]: string };
}

interface IndexFkReference {
    sourceTable: string;
    sourceColumn: string;
    sourceFile: string;
    sourceLine: number;
    targetTable: string;
    fkValue: string;
    fkValueLower?: string;
}

export interface IndexFile {
    tables: { [table: string]: IndexRow[] };
    fkReferences: IndexFkReference[];
    fileTableMap: { [file: string]: string };
}

interface SchemaColumn {
    name: string;
    is_foreign_key?: boolean;
    fk_target?: { table: string; column: string };
}

interface SchemaDoc {
    tables: { [file: string]: { columns?: SchemaColumn[] } };
}

export class IndexFileDatasetModel implements DatasetModel {
    private fileByTable = new Map<string, string>();
    private fkEdgeCache = new Map<string, FkEdge[]>();

    constructor(private index: IndexFile, private schema: SchemaDoc) {
        for (const [file, table] of Object.entries(index.fileTableMap ?? {})) {
            this.fileByTable.set(table, file);
        }
    }

    private toEngineRow(r: IndexRow): EngineRow {
        return { table: r.tableName, file: r.file, line: r.lineNumber, pk: r.pkValue, values: r.values };
    }

    getRow(table: string, pk: string): EngineRow | undefined {
        const target = pk.toLowerCase();
        const row = (this.index.tables[table] ?? []).find(
            r => (r.pkValueLower ?? String(r.pkValue).toLowerCase()) === target);
        return row ? this.toEngineRow(row) : undefined;
    }

    getRows(table: string): EngineRow[] {
        return (this.index.tables[table] ?? []).map(r => this.toEngineRow(r));
    }

    getForeignKeys(table: string): FkEdge[] {
        const cached = this.fkEdgeCache.get(table);
        if (cached) {
            return cached;
        }
        const file = this.fileByTable.get(table);
        const schemaTable = file ? this.schema.tables?.[file] : undefined;
        const edges: FkEdge[] = [];
        for (const col of schemaTable?.columns ?? []) {
            if (col.is_foreign_key && col.fk_target) {
                edges.push({ column: col.name, targetTable: col.fk_target.table, targetColumn: col.fk_target.column });
            }
        }
        this.fkEdgeCache.set(table, edges);
        return edges;
    }

    getIncomingReferences(table: string, pk: string): IncomingReference[] {
        const key = pk.toLowerCase();
        const fromIndex: IncomingReference[] = (this.index.fkReferences ?? [])
            .filter(r => r.targetTable === table
                && (r.fkValueLower ?? String(r.fkValue).toLowerCase()) === key)
            .map(r => ({
                fromTable: r.sourceTable, fromColumn: r.sourceColumn, fromPk: '',
                fromFile: r.sourceFile, fromLine: r.sourceLine,
            }));
        return mergeIncomingReferences(fromIndex, scanIncomingReferences(this, table, pk));
    }

    getFileName(table: string): string | undefined {
        return this.fileByTable.get(table);
    }

    getTableForFile(file: string): string | undefined {
        return this.index.fileTableMap?.[file];
    }

    getTableNames(): string[] {
        return Object.keys(this.index.tables ?? {});
    }

    resolveEntityTable(kind: string): string | undefined {
        const key = kind.toLowerCase();
        if (this.index.tables?.[key]) {
            return key;
        }
        const aliasFile = ENTITY_FILE_ALIASES[key];
        if (aliasFile && this.index.fileTableMap?.[aliasFile]) {
            return this.index.fileTableMap[aliasFile];
        }
        return this.index.fileTableMap?.[key];
    }
}
