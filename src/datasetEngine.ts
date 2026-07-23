/**
 * SWAT+ dataset engine — extension binding.
 *
 * Adapts the extension's {@link SwatIndexer} to the vscode-free
 * {@link DatasetModel} contract and wires in the enriched input/output schemas,
 * so the engine's query functions (describeEntity, findReferences, lookupDocs)
 * can run against a live indexed dataset. This is the seam a future MCP server /
 * chat participant calls into.
 */

import { SwatIndexer } from './indexer';
import { EnrichedSchemaProvider } from './enrichedSchema';
import {
    DatasetModel,
    EngineRow,
    FkEdge,
    IncomingReference,
    EngineDocs,
    describeEntity,
    findReferences,
    lookupDocs,
    scanIncomingReferences,
    mergeIncomingReferences,
    ENTITY_FILE_ALIASES,
} from './datasetEngineCore';
import {
    Predicate,
    QueryOptions,
    queryRows,
    findOrphans,
    renderQueryResult,
} from './datasetQuery';

export class SwatIndexerDatasetModel implements DatasetModel {
    constructor(private indexer: SwatIndexer) {}

    private toEngineRow(row: {
        tableName: string; file: string; lineNumber: number; pkValue: string;
        values: { [column: string]: string };
    }): EngineRow {
        return {
            table: row.tableName,
            file: row.file,
            line: row.lineNumber,
            pk: row.pkValue,
            values: row.values,
        };
    }

    getRow(table: string, pk: string): EngineRow | undefined {
        const row = this.indexer.resolveFKTarget(table, pk);
        return row ? this.toEngineRow(row) : undefined;
    }

    getRows(table: string): EngineRow[] {
        const tableIndex = this.indexer.getIndexData().get(table);
        if (!tableIndex) {
            return [];
        }
        return [...tableIndex.values()].map(row => this.toEngineRow(row));
    }

    getForeignKeys(table: string): FkEdge[] {
        const schema = this.indexer.getSchema();
        const fileName = this.indexer.getFileNameForTable(table);
        const schemaTable = fileName ? schema?.tables[fileName] : undefined;
        if (!schemaTable) {
            return [];
        }
        const edges: FkEdge[] = [];
        for (const col of schemaTable.columns) {
            if (col.is_foreign_key && col.fk_target) {
                edges.push({
                    column: col.name,
                    targetTable: col.fk_target.table,
                    targetColumn: col.fk_target.column,
                });
            }
        }
        return edges;
    }

    getIncomingReferences(table: string, pk: string): IncomingReference[] {
        // The index's reverse list covers id-resolved and hierarchical
        // references (e.g. management-schedule operations). Merge in a
        // value-based scan to also catch name-pointer FKs the index misses
        // (e.g. which HRUs use a given soil); the scan also supplies the source
        // row pk, which the index's FKReference does not carry.
        const indexed = this.indexer.getIncomingFKReferences(table, pk).map(ref => ({
            fromTable: ref.sourceTable,
            fromColumn: ref.sourceColumn,
            fromPk: '',
            fromFile: ref.sourceFile,
            fromLine: ref.sourceLine,
        }));
        return mergeIncomingReferences(indexed, scanIncomingReferences(this, table, pk));
    }

    getTableNames(): string[] {
        return [...this.indexer.getIndexData().keys()];
    }

    getFileName(table: string): string | undefined {
        return this.indexer.getFileNameForTable(table);
    }

    getTableForFile(file: string): string | undefined {
        return this.indexer.getTableNameFromFile(file);
    }

    resolveEntityTable(kind: string): string | undefined {
        const key = kind.toLowerCase();
        // Direct table name?
        if (this.indexer.isTableIndexed(key)) {
            return key;
        }
        // Known alias → file → table.
        const aliasFile = ENTITY_FILE_ALIASES[key];
        if (aliasFile) {
            const table = this.indexer.getTableNameFromFile(aliasFile);
            if (table) {
                return table;
            }
        }
        // Treat the kind as a file name (e.g. "aquifer.aqu").
        return this.indexer.getTableNameFromFile(key);
    }
}

/**
 * A ready-to-use engine bound to the live indexer and enriched schemas. Thin
 * wrapper so callers (commands, a future MCP server) get the query functions
 * without assembling the model and docs themselves.
 */
export class SwatDatasetEngine {
    private model: SwatIndexerDatasetModel;
    private docs: EngineDocs;

    constructor(indexer: SwatIndexer, enriched: EnrichedSchemaProvider) {
        this.model = new SwatIndexerDatasetModel(indexer);
        this.docs = {
            input: enriched.inputIndex,
            output: enriched.outputIndexRef,
        };
    }

    /** Resolve an entity kind ("hru") or file/table name to a table name. */
    resolveEntityTable(kind: string): string | undefined {
        return this.model.resolveEntityTable(kind);
    }

    describeEntity(table: string, pk: string): string {
        return describeEntity(this.model, this.docs, table, pk);
    }

    findReferences(table: string, pk: string): string {
        return findReferences(this.model, table, pk);
    }

    lookupDocs(file: string, column?: string): string {
        return lookupDocs(this.docs, file, column);
    }

    /** Rows in a table matching predicates, rendered as compact markdown. */
    queryRows(table: string, predicates: Predicate[], options?: QueryOptions): string {
        const fileName = this.model.getFileName(table) ?? table;
        const result = queryRows(this.model, table, predicates, options);
        const heading = predicates.length
            ? `rows matching ${describePredicates(predicates, options?.match ?? 'all')}`
            : 'rows';
        return renderQueryResult(result, fileName, heading);
    }

    /** Rows in a table that nothing references (unused), rendered as markdown. */
    findOrphans(table: string, limit?: number): string {
        const fileName = this.model.getFileName(table) ?? table;
        const result = findOrphans(this.model, table, { limit });
        return renderQueryResult(result, fileName, 'unreferenced (orphan) rows');
    }

    getModel(): SwatIndexerDatasetModel {
        return this.model;
    }
}

/** Human-readable summary of a predicate list, for result headings. */
function describePredicates(predicates: Predicate[], match: 'all' | 'any'): string {
    const parts = predicates.map(p => {
        const not = p.negate ? 'NOT ' : '';
        return p.operator === 'is_empty'
            ? `${not}${p.column} is empty`
            : `${not}${p.column} ${p.operator} ${p.value ?? ''}`.trim();
    });
    return parts.join(match === 'any' ? ' OR ' : ' AND ');
}
