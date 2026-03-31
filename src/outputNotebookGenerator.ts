import * as fs from 'fs';
import * as path from 'path';
import type { Schema } from './indexer';

interface NotebookCell {
    cell_type: 'markdown' | 'code';
    metadata: Record<string, unknown>;
    source: string[];
    execution_count?: null;
    outputs?: unknown[];
}

interface NotebookDocument {
    cells: NotebookCell[];
    metadata: Record<string, unknown>;
    nbformat: number;
    nbformat_minor: number;
}

export interface OutputNotebookGenerationResult {
    outputDir: string;
    indexNotebookPath: string | null;
    notebookPaths: string[];
    scannedOutputFiles: string[];
}

export function generateOutputNotebooks(datasetPath: string, schema: Schema | null): OutputNotebookGenerationResult {
    const outputFiles = collectOutputFiles(datasetPath, schema);
    const outputDir = path.join(datasetPath, 'notebooks', 'outputs');
    fs.mkdirSync(outputDir, { recursive: true });

    const generatedNotebooks: Array<{ sourceFilePath: string; notebookPath: string }> = [];
    const notebookPaths: string[] = [];
    for (const filePath of outputFiles) {
        const notebookPath = path.join(outputDir, `${path.basename(filePath)}.ipynb`);
        const notebook = buildNotebookDocument(filePath, notebookPath);
        fs.writeFileSync(notebookPath, JSON.stringify(notebook, null, 2), 'utf-8');
        generatedNotebooks.push({ sourceFilePath: filePath, notebookPath });
        notebookPaths.push(notebookPath);
    }

    const indexNotebookPath = notebookPaths.length > 0
        ? path.join(outputDir, 'index.ipynb')
        : null;
    if (indexNotebookPath) {
        const indexNotebook = buildIndexNotebookDocument(generatedNotebooks, indexNotebookPath);
        fs.writeFileSync(indexNotebookPath, JSON.stringify(indexNotebook, null, 2), 'utf-8');
    }

    return {
        outputDir,
        indexNotebookPath,
        notebookPaths,
        scannedOutputFiles: outputFiles
    };
}

function collectOutputFiles(datasetPath: string, schema: Schema | null): string[] {
    const schemaInputFiles = new Set<string>();
    const schemaOutputFiles = new Set<string>();
    const fileCioInputs = collectFileCioReferences(path.join(datasetPath, 'file.cio'));

    if (schema) {
        for (const table of Object.values(schema.tables)) {
            const target = table.model_class.startsWith('output.')
                ? schemaOutputFiles
                : schemaInputFiles;
            normalizeFileNameVariants(table.file_name).forEach(variant => target.add(variant));
        }
    }

    const collected: string[] = [];
    walkDatasetFiles(datasetPath, filePath => {
        const fileName = path.basename(filePath);
        if (shouldTreatAsOutputFile(fileName, schemaInputFiles, schemaOutputFiles, fileCioInputs)) {
            collected.push(filePath);
        }
    });

    return collected.sort((a, b) => a.localeCompare(b));
}

function walkDatasetFiles(rootDir: string, onFile: (filePath: string) => void): void {
    const skipDirNames = new Set(['.git', 'node_modules', 'notebooks', '.venv', 'venv', '__pycache__']);
    const pending = [rootDir];

    while (pending.length > 0) {
        const currentDir = pending.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!skipDirNames.has(entry.name.toLowerCase())) {
                    pending.push(fullPath);
                }
                continue;
            }

            onFile(fullPath);
        }
    }
}

function shouldTreatAsOutputFile(
    fileName: string,
    schemaInputFiles: Set<string>,
    schemaOutputFiles: Set<string>,
    fileCioInputs: Set<string>
): boolean {
    const ext = path.extname(fileName).toLowerCase();
    const variants = normalizeFileNameVariants(fileName);

    if (variants.some(variant => schemaOutputFiles.has(variant))) {
        return true;
    }

    if (variants.some(variant => schemaInputFiles.has(variant) || fileCioInputs.has(variant))) {
        return false;
    }

    return ext === '.csv' || ext === '.out' || ext === '.txt';
}

function normalizeFileNameVariants(fileName: string): string[] {
    const lower = fileName.toLowerCase();
    const variants = new Set<string>([lower]);
    variants.add(lower.replace(/-/g, '_'));
    variants.add(lower.replace(/_/g, '-'));
    variants.add(lower.replace(/-/g, '_').replace(/_/g, '-'));
    return Array.from(variants);
}

function collectFileCioReferences(fileCioPath: string): Set<string> {
    const inputs = new Set<string>();
    if (!fs.existsSync(fileCioPath)) {
        return inputs;
    }

    let content: string;
    try {
        content = fs.readFileSync(fileCioPath, 'utf-8');
    } catch {
        return inputs;
    }

    const lines = content.split(/\r?\n/);
    for (const line of lines.slice(1)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const parts = trimmed.split(/\s+/);
        for (const rawFileName of parts.slice(1)) {
            const lower = rawFileName.toLowerCase();
            if (!lower || lower === 'null' || lower === '0') {
                continue;
            }
            normalizeFileNameVariants(rawFileName).forEach(variant => inputs.add(variant));
        }
    }

    return inputs;
}

function buildNotebookDocument(filePath: string, notebookPath: string): NotebookDocument {
    const relativeOutputPath = toNotebookPath(path.relative(path.dirname(notebookPath), filePath));
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const parserKind = ext === '.csv' ? 'csv' : 'structured_text';

    return {
        cells: [
            markdownCell(`# ${fileName}\n\nGenerated notebook for reviewing SWAT+ output file \`${fileName}\`.`),
            codeCell(getParserHelperSource()),
            codeCell([
                'from pathlib import Path',
                '',
                `OUTPUT_PATH = Path(r"${relativeOutputPath}")`,
                `PARSER_KIND = "${parserKind}"`,
                '',
                'title, header, units, df = load_swat_output(OUTPUT_PATH, PARSER_KIND)',
                'print(f"Title: {title}")',
                'print(f"Rows: {len(df)}")',
                'print(f"Columns: {len(df.columns)}")',
                '',
                'if units is not None:',
                '    display({"units": dict(zip(df.columns, units))})',
                '',
                'df.head()'
            ].join('\n')),
            codeCell([
                'numeric_df = df.select_dtypes(include="number")',
                'numeric_df.describe().T if not numeric_df.empty else "No numeric columns detected."'
            ].join('\n'))
        ],
        metadata: {
            kernelspec: {
                display_name: 'Python 3',
                language: 'python',
                name: 'python3'
            },
            language_info: {
                name: 'python'
            }
        },
        nbformat: 4,
        nbformat_minor: 5
    };
}

function buildIndexNotebookDocument(
    generatedNotebooks: Array<{ sourceFilePath: string; notebookPath: string }>,
    indexNotebookPath: string
): NotebookDocument {
    const rows = generatedNotebooks
        .slice()
        .sort((a, b) => path.basename(a.sourceFilePath).localeCompare(path.basename(b.sourceFilePath)))
        .map(entry => ({
            output_file: path.basename(entry.sourceFilePath),
            source_path: toNotebookPath(path.relative(path.dirname(indexNotebookPath), entry.sourceFilePath)),
            notebook_path: toNotebookPath(path.relative(path.dirname(indexNotebookPath), entry.notebookPath)),
            extension: path.extname(entry.sourceFilePath).toLowerCase()
        }));

    const linkLines = rows.map(row => `- [${row.output_file}](${row.notebook_path}) from \`${row.source_path}\``);
    const rowsJson = JSON.stringify(rows, null, 2);

    return {
        cells: [
            markdownCell([
                '# SWAT+ Output Notebook Index',
                '',
                'Generated notebooks for detected output files.',
                '',
                '## Notebook Links',
                ...linkLines
            ].join('\n')),
            codeCell([
                'import pandas as pd',
                '',
                `outputs = pd.DataFrame(${rowsJson})`,
                'outputs'
            ].join('\n'))
        ],
        metadata: {
            kernelspec: {
                display_name: 'Python 3',
                language: 'python',
                name: 'python3'
            },
            language_info: {
                name: 'python'
            }
        },
        nbformat: 4,
        nbformat_minor: 5
    };
}

function getParserHelperSource(): string {
    return [
        'from pathlib import Path',
        'import re',
        'import pandas as pd',
        '',
        'def split_fields(line: str) -> list[str]:',
        '    return re.split(r"\\s+", line.strip()) if line.strip() else []',
        '',
        'def numeric_like_ratio(tokens: list[str]) -> float:',
        '    if not tokens:',
        '        return 0.0',
        '    numeric_count = 0',
        '    for token in tokens:',
        '        cleaned = token.strip().replace(",", "")',
        '        if cleaned in {"", "-", "--", "na", "n/a"}:',
        '            continue',
        '        try:',
        '            float(cleaned)',
        '            numeric_count += 1',
        '        except ValueError:',
        '            pass',
        '    return numeric_count / len(tokens)',
        '',
        'def looks_like_units_row(tokens: list[str], header_len: int, next_tokens: list[str]) -> bool:',
        '    if len(tokens) != header_len or not next_tokens:',
        '        return False',
        '    candidate_ratio = numeric_like_ratio(tokens)',
        '    next_ratio = numeric_like_ratio(next_tokens)',
        '    return candidate_ratio <= 0.25 and next_ratio >= candidate_ratio',
        '',
        'def rows_to_dataframe(rows: list[list[str]], header: list[str]) -> pd.DataFrame:',
        '    normalized_rows = []',
        '    for row in rows:',
        '        if len(row) < len(header):',
        '            row = row + [""] * (len(header) - len(row))',
        '        elif len(row) > len(header) and len(header) > 0:',
        '            row = row[: len(header) - 1] + [" ".join(row[len(header) - 1:])]',
        '        normalized_rows.append(row)',
        '',
        '    df = pd.DataFrame(normalized_rows, columns=header)',
        '    for column in df.columns:',
        '        converted = pd.to_numeric(df[column], errors="coerce")',
        '        if converted.notna().sum() >= max(1, int(len(df) * 0.6)):',
        '            df[column] = converted',
        '    return df',
        '',
        'def parse_structured_output(path: Path):',
        '    lines = [line.rstrip("\\n") for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()]',
        '    lines = [line for line in lines if line.strip()]',
        '    if len(lines) < 2:',
        '        raise ValueError(f"Not enough non-empty lines in {path}")',
        '',
        '    title = lines[0].strip()',
        '    header = split_fields(lines[1])',
        '    units = None',
        '    data_start = 2',
        '',
        '    if len(lines) >= 4:',
        '        candidate_units = split_fields(lines[2])',
        '        next_tokens = split_fields(lines[3])',
        '        if looks_like_units_row(candidate_units, len(header), next_tokens):',
        '            units = candidate_units',
        '            data_start = 3',
        '',
        '    rows = []',
        '    for raw_line in lines[data_start:]:',
        '        stripped = raw_line.strip()',
        '        if not stripped or set(stripped) <= {"-", "="}:',
        '            continue',
        '        rows.append(split_fields(stripped))',
        '',
        '    return title, header, units, rows_to_dataframe(rows, header)',
        '',
        'def load_swat_output(path: Path, parser_kind: str = "structured_text"):',
        '    if parser_kind == "csv":',
        '        df = pd.read_csv(path)',
        '        return path.name, list(df.columns), None, df',
        '    return parse_structured_output(path)'
    ].join('\n');
}

function markdownCell(source: string): NotebookCell {
    return {
        cell_type: 'markdown',
        metadata: {},
        source: withTrailingNewline(source)
    };
}

function codeCell(source: string): NotebookCell {
    return {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: withTrailingNewline(source)
    };
}

function withTrailingNewline(source: string): string[] {
    return source.split('\n').map(line => `${line}\n`);
}

function toNotebookPath(relativePath: string): string {
    return relativePath.replace(/\\/g, '\\\\');
}
