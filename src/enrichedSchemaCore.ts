/**
 * Pure (vscode-free) core of the enriched SWAT+ schema layer.
 *
 * Parses the enriched schema JSON into fast lookup maps and renders column
 * documentation to plain markdown lines. Kept free of the vscode API so it can
 * be unit-tested directly and, later, reused by a headless dataset engine.
 */

export interface ColumnDoc {
    description?: string;
    source_meaning?: string;
    units?: string;
    fortran_type?: string;
    fortran_target?: string;
    default?: string;
    source_ref?: string;
    match?: string;
    inherited_from?: string;
}

export interface FileDoc {
    reader_source?: string;
    primary_target?: string;
    summary?: string[];
    layout_notes?: string;
    module_usage?: { [module: string]: string };
    inherited_from?: string;
}

interface EnrichedColumn {
    name?: string;
    db_column?: string;
    doc?: ColumnDoc;
}

interface EnrichedTable {
    file_name?: string;
    origin?: string;
    doc?: FileDoc;
    columns?: EnrichedColumn[];
}

export interface EnrichedSchemaFile {
    enrichment?: {
        swatplus_version?: string;
        overlays_repo?: string;
        files_enriched?: number;
    };
    tables?: { [fileName: string]: EnrichedTable };
}

/**
 * Indexed, read-only view over an enriched schema document. Constructed from the
 * parsed JSON; all lookups are case-insensitive on file and column names.
 */
export class EnrichedSchemaIndex {
    private version: string | undefined;
    private files = new Map<string, {
        fileDoc?: FileDoc;
        columns: Map<string, ColumnDoc>;
    }>();

    constructor(data: EnrichedSchemaFile | null | undefined) {
        if (!data) {
            return;
        }
        this.version = data.enrichment?.swatplus_version;
        for (const [fileName, table] of Object.entries(data.tables || {})) {
            const columns = new Map<string, ColumnDoc>();
            for (const col of table.columns || []) {
                if (!col.doc) {
                    continue;
                }
                if (col.name) {
                    columns.set(col.name.toLowerCase(), col.doc);
                }
                if (col.db_column && col.db_column !== col.name) {
                    columns.set(col.db_column.toLowerCase(), col.doc);
                }
            }
            if (table.doc || columns.size > 0) {
                this.files.set(fileName.toLowerCase(), { fileDoc: table.doc, columns });
            }
        }
    }

    public isAvailable(): boolean {
        return this.files.size > 0;
    }

    public getSwatplusVersion(): string | undefined {
        return this.version;
    }

    public getFileDoc(fileName: string): FileDoc | undefined {
        return this.files.get(fileName.toLowerCase())?.fileDoc;
    }

    public getColumnDoc(fileName: string, columnName: string): ColumnDoc | undefined {
        return this.files.get(fileName.toLowerCase())?.columns.get(columnName.toLowerCase());
    }
}

/**
 * Render a column's documentation to markdown lines. Returns an empty array when
 * `doc` is undefined or carries no displayable content.
 */
export function renderColumnDocLines(doc: ColumnDoc | undefined): string[] {
    if (!doc) {
        return [];
    }
    const lines: string[] = [];
    if (doc.description) {
        lines.push(doc.description);
    }
    const facts: string[] = [];
    if (doc.units) {
        facts.push(`**Units:** ${doc.units}`);
    }
    if (doc.fortran_type) {
        facts.push(`**Type:** ${doc.fortran_type}`);
    }
    if (doc.default) {
        facts.push(`**Default:** ${doc.default}`);
    }
    if (facts.length > 0) {
        lines.push(facts.join(' · '));
    }
    if (doc.source_ref) {
        lines.push(`_Source: ${doc.source_ref}_`);
    }
    return lines;
}

// --- Output-file schema (from output-family overlays) ---------------------

export interface OutputColumnDoc {
    description?: string;
    units?: string;
    source_field?: string;
}

export interface OutputFileDoc {
    family?: string;
    summary?: string;
    columns?: { [column: string]: OutputColumnDoc };
}

export interface OutputSchemaFile {
    enrichment?: { swatplus_version?: string };
    files?: { [stem: string]: OutputFileDoc };
}

/** Strip a `.txt`/`.csv` extension and lowercase, yielding the output-file stem. */
export function outputFileStem(fileName: string): string {
    return fileName.replace(/\.(txt|csv)$/i, '').toLowerCase();
}

/**
 * Indexed, read-only view over the output-file schema. Keyed by output-file stem
 * (the name without `.txt`/`.csv`), since those pairs share a column layout.
 */
export class OutputSchemaIndex {
    private version: string | undefined;
    private files = new Map<string, OutputFileDoc>();

    constructor(data: OutputSchemaFile | null | undefined) {
        if (!data) {
            return;
        }
        this.version = data.enrichment?.swatplus_version;
        for (const [stem, doc] of Object.entries(data.files || {})) {
            this.files.set(stem.toLowerCase(), doc);
        }
    }

    public isAvailable(): boolean {
        return this.files.size > 0;
    }

    public getSwatplusVersion(): string | undefined {
        return this.version;
    }

    public getFileDoc(fileName: string): OutputFileDoc | undefined {
        return this.files.get(outputFileStem(fileName));
    }

    public getColumnDoc(fileName: string, column: string): OutputColumnDoc | undefined {
        const file = this.files.get(outputFileStem(fileName));
        if (!file?.columns) {
            return undefined;
        }
        // Exact, then case-insensitive.
        return file.columns[column]
            ?? file.columns[Object.keys(file.columns).find(
                k => k.toLowerCase() === column.toLowerCase()) ?? ''];
    }
}

/**
 * Build a plain-text (newline-separated) documentation snippet for a column,
 * suitable for an HTML `title=` tooltip attribute. Returns '' when no doc.
 */
export function columnDocTooltip(doc: ColumnDoc | undefined): string {
    if (!doc) {
        return '';
    }
    const parts: string[] = [];
    if (doc.description) {
        parts.push(doc.description);
    }
    const facts: string[] = [];
    if (doc.units) {
        facts.push(`Units: ${doc.units}`);
    }
    if (doc.fortran_type) {
        facts.push(`Type: ${doc.fortran_type}`);
    }
    if (doc.default) {
        facts.push(`Default: ${doc.default}`);
    }
    if (facts.length > 0) {
        parts.push(facts.join('  '));
    }
    if (doc.source_ref) {
        parts.push(`Source: ${doc.source_ref}`);
    }
    return parts.join('\n');
}

/** Plain-text tooltip for an output column (description, units, source field). */
export function outputColumnDocTooltip(doc: OutputColumnDoc | undefined): string {
    if (!doc) {
        return '';
    }
    const parts: string[] = [];
    if (doc.description) {
        parts.push(doc.description);
    }
    const facts: string[] = [];
    if (doc.units) {
        facts.push(`Units: ${doc.units}`);
    }
    if (doc.source_field) {
        facts.push(`Field: ${doc.source_field}`);
    }
    if (facts.length > 0) {
        parts.push(facts.join('  '));
    }
    return parts.join('\n');
}
