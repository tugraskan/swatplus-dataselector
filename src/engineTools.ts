/**
 * Shared engine tool set (vscode-free).
 *
 * One definition of the dataset-query tools — describe an entity, find
 * references, look up docs, list entities, query rows, find orphans — consumed by
 * both the MCP server (`src/mcp/server.ts`) and the `@swat` chat participant
 * (`src/chatParticipant.ts`), so the two never drift.
 *
 * {@link createEngineHost} adapts a {@link DatasetModel} + docs into the
 * entity-string-based {@link EngineToolHost} the tools call. {@link ENGINE_TOOLS}
 * carries each tool's name, description, JSON input schema, and an `invoke` that
 * maps parsed arguments onto the host.
 */

import {
    DatasetModel,
    EngineDocs,
    describeEntity,
    findReferences,
    lookupDocs,
    ENTITY_FILE_ALIASES,
} from './datasetEngineCore';
import {
    Predicate,
    QueryOptions,
    queryRows,
    findOrphans,
    renderQueryResult,
} from './datasetQuery';

/** Operations the tools invoke; each takes user-facing entity strings and
 * returns rendered markdown text. */
export interface EngineToolHost {
    describeEntity(entity: string, id: string): string;
    findReferences(entity: string, id: string): string;
    lookupDocs(file: string, column?: string): string;
    listEntities(entity: string, limit?: number): string;
    queryRows(entity: string, predicates: Predicate[], options?: QueryOptions): string;
    findOrphans(entity: string, limit?: number): string;
}

function unresolvedHint(entity: string): string {
    const kinds = Object.keys(ENTITY_FILE_ALIASES).join(', ');
    return `Could not resolve "${entity}". Try an entity kind (${kinds}), a file name ` +
        `(e.g. hru-data.hru), or a table name.`;
}

/** Build an {@link EngineToolHost} over a dataset model and its documentation. */
export function createEngineHost(model: DatasetModel, docs: EngineDocs): EngineToolHost {
    const resolve = (entity: string) => model.resolveEntityTable(entity);
    return {
        describeEntity(entity, id) {
            const table = resolve(entity);
            return table ? describeEntity(model, docs, table, id) : unresolvedHint(entity);
        },
        findReferences(entity, id) {
            const table = resolve(entity);
            return table ? findReferences(model, table, id) : unresolvedHint(entity);
        },
        lookupDocs(file, column) {
            return lookupDocs(docs, file, column);
        },
        listEntities(entity, limit) {
            const table = resolve(entity);
            if (!table) {
                return unresolvedHint(entity);
            }
            const rows = model.getRows(table);
            const ids = rows.slice(0, limit ?? 100).map(r => r.pk);
            const file = model.getFileName(table) ?? table;
            const more = rows.length > ids.length ? ` (of ${rows.length})` : '';
            return `# ${file}: ${ids.length}${more} ids\n\n${ids.join(', ')}`;
        },
        queryRows(entity, predicates, options) {
            const table = resolve(entity);
            if (!table) {
                return unresolvedHint(entity);
            }
            const file = model.getFileName(table) ?? table;
            return renderQueryResult(queryRows(model, table, predicates, options), file, 'matching rows');
        },
        findOrphans(entity, limit) {
            const table = resolve(entity);
            if (!table) {
                return unresolvedHint(entity);
            }
            const file = model.getFileName(table) ?? table;
            return renderQueryResult(findOrphans(model, table, { limit }), file, 'unreferenced (orphan) rows');
        },
    };
}

/** A tool the language model can call, with a JSON input schema and a dispatch. */
export interface EngineToolDef {
    name: string;
    description: string;
    inputSchema: object;
    invoke(host: EngineToolHost, args: Record<string, unknown>): string;
}

const predicateItemSchema = {
    type: 'object',
    properties: {
        column: { type: 'string' },
        operator: { type: 'string', enum: ['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'is_empty'] },
        value: { type: 'string' },
        negate: { type: 'boolean' },
    },
    required: ['column', 'operator'],
};

export const ENGINE_TOOLS: EngineToolDef[] = [
    {
        name: 'describe_entity',
        description: 'Describe one SWAT+ entity: its column values with documented meanings, '
            + 'resolved foreign-key connections, and incoming references. Example: entity="hru", id="81".',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string', description: 'Entity kind (hru, aquifer, channel…), file, or table name' },
                id: { type: 'string', description: 'The entity id or name, e.g. "81" or "soil_01-h1"' },
            },
            required: ['entity', 'id'],
        },
        invoke: (host, args) => host.describeEntity(String(args.entity), String(args.id)),
    },
    {
        name: 'find_references',
        description: 'List the rows that reference a given entity (reverse lookup), including '
            + 'name-pointer references. Example: entity="soils.sol", id="soil_01-h1".',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string' },
                id: { type: 'string' },
            },
            required: ['entity', 'id'],
        },
        invoke: (host, args) => host.findReferences(String(args.entity), String(args.id)),
    },
    {
        name: 'lookup_docs',
        description: 'Documentation for an input or output file and optionally a column '
            + '(meaning, units, type, default, source line). Works with no dataset. '
            + 'Example: file="aquifer.aqu", column="gw_flo".',
        inputSchema: {
            type: 'object',
            properties: {
                file: { type: 'string' },
                column: { type: 'string' },
            },
            required: ['file'],
        },
        invoke: (host, args) => host.lookupDocs(
            String(args.file), args.column !== undefined ? String(args.column) : undefined),
    },
    {
        name: 'list_entities',
        description: 'List the ids/names of rows in an entity table, to discover what can be '
            + 'described or queried. Example: entity="hru".',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string' },
                limit: { type: 'number' },
            },
            required: ['entity'],
        },
        invoke: (host, args) => host.listEntities(
            String(args.entity), typeof args.limit === 'number' ? args.limit : undefined),
    },
    {
        name: 'query_rows',
        description: 'Find rows in a table matching column predicates. Operators: equals, contains, '
            + 'gt, gte, lt, lte, in (comma-separated), is_empty. Example: entity="channel.cha", '
            + 'predicates=[{column:"slope",operator:"gt",value:"0.1"}].',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string' },
                predicates: { type: 'array', items: predicateItemSchema },
                match: { type: 'string', enum: ['all', 'any'] },
                limit: { type: 'number' },
            },
            required: ['entity', 'predicates'],
        },
        invoke: (host, args) => host.queryRows(
            String(args.entity),
            (args.predicates as Predicate[]) ?? [],
            {
                match: args.match === 'any' ? 'any' : 'all',
                limit: typeof args.limit === 'number' ? args.limit : undefined,
            }),
    },
    {
        name: 'find_orphans',
        description: 'List rows in a table that nothing references — candidates for unused/dead '
            + 'data. Example: entity="soils.sol".',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string' },
                limit: { type: 'number' },
            },
            required: ['entity'],
        },
        invoke: (host, args) => host.findOrphans(
            String(args.entity), typeof args.limit === 'number' ? args.limit : undefined),
    },
];

/** Look up a tool definition by name. */
export function getEngineTool(name: string): EngineToolDef | undefined {
    return ENGINE_TOOLS.find(t => t.name === name);
}
