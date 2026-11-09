/**
 * The parts of `check_inputs` no single line of a file shows.
 *
 * `inputCheck.ts` judges each line against the read statement that takes it.
 * These checks judge what the lines mean together, for failures SWAT+ never
 * reports:
 *
 * - **Decision tables.** `lum.dtl` names actions by text. `dtbl_lum_read.f90`
 *   turns each into database numbers by a `select case`, and `actions.f90` runs
 *   it by another. A spelling only the second one knows runs with entry 0 of
 *   its database. Both lists come from the source that will run, so a version
 *   that adds an action needs no change here.
 * - **Weather.** Past the end of a record, SWAT+ generates the day and goes on.
 * - **Crops.** A crop that starts as `n` in `plant.ini` grows only if something
 *   plants it; otherwise its HRUs stay bare for the whole run.
 *
 * Pure: the server reads the files and passes their text in.
 */

import type { CioFileIdentity } from './cioCheck';
import type {
    DatasetFile,
    InputCheckContext,
    InputCheckRun,
    InputExpectations,
    InputIssue,
    InputIssueSeverity,
    NamedFile,
} from './inputCheck';

/** The source tree that will read the dataset, as far as these checks need it. */
export interface InputSourceFacts {
    dir: string;
    commit: string | null;
    dtblLumRead: { text: string; identity: CioFileIdentity } | null;
    actions: { text: string; identity: CioFileIdentity } | null;
    /** Why no layouts could be exported from this tree, when that was tried. */
    layoutsNote?: string;
}

interface DataRow {
    tokens: string[];
    line: number;
}

function dataRows(text: string, skip: number): DataRow[] {
    const rows: DataRow[] = [];
    const lines = text.split(/\r?\n/);
    for (let index = skip; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (line) {
            rows.push({ tokens: line.split(/\s+/), line: index + 1 });
        }
    }
    return rows;
}

function columnIndex(expectations: InputExpectations, file: string, name: string, fallback: number): number {
    const found = expectations.layouts.get(file)?.fields.findIndex(field => field.name === name) ?? -1;
    return found >= 0 ? found : fallback;
}

function listed(names: string[], limit = 6): string {
    return names.length > limit
        ? `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`
        : names.join(', ');
}

export interface DecisionAction {
    line: number;
    typ: string;
    option: string;
    filePointer: string;
}

export interface DecisionTable {
    name: string;
    actions: DecisionAction[];
}

/**
 * The tables of a `lum.dtl`, walked as `dtbl_lum_read.f90` walks them: title,
 * count and one skipped line, then per table a header, its name and sizes, a
 * header, its conditions, a header and its actions. Blank lines between them
 * are passed over by the list-directed reads. `null`: not that shape.
 */
export function parseDecisionTables(text: string): DecisionTable[] | null {
    const count = Number(text.split(/\r?\n/)[1]?.trim().split(/\s+/)[0]);
    if (!Number.isInteger(count) || count < 0) {
        return null;
    }
    const rows = dataRows(text, 3);
    const tables: DecisionTable[] = [];
    let at = 0;
    for (let table = 0; table < count && at + 1 < rows.length; table += 1) {
        const [name, conds, alts, acts] = rows[at + 1].tokens;
        const conditions = Number(conds);
        const actions = Number(acts);
        if (!Number.isInteger(conditions) || !Number.isInteger(Number(alts)) || !Number.isInteger(actions)) {
            return null;
        }
        at += 2 + 1 + conditions + 1;
        if (at + actions > rows.length) {
            return null;
        }
        tables.push({
            name,
            actions: rows.slice(at, at + actions).map(({ tokens, line }) => ({
                line,
                typ: tokens[0],
                option: tokens[4] ?? '',
                filePointer: tokens[7] ?? '',
            })),
        });
        at += actions;
    }
    return tables;
}

export interface Schedule {
    name: string;
    autos: { name: string; crops: string[] }[];
    ops: { op: string; crop: string | null }[];
}

/** A `management.sch`, as `mgt_read_mgtops.f90` reads it: each schedule's tables, then its operations. */
export function parseSchedules(text: string): Schedule[] | null {
    const rows = dataRows(text, 2);
    const schedules: Schedule[] = [];
    let at = 0;
    while (at < rows.length) {
        const [name, ops, autos] = rows[at].tokens;
        const opCount = Number(ops);
        const autoCount = Number(autos);
        if (!Number.isInteger(opCount) || !Number.isInteger(autoCount)
            || at + 1 + autoCount + opCount > rows.length) {
            return null;
        }
        at += 1;
        schedules.push({
            name,
            autos: rows.slice(at, at + autoCount).map(({ tokens }) => ({ name: tokens[0], crops: tokens.slice(1) })),
            ops: rows.slice(at + autoCount, at + autoCount + opCount)
                .map(({ tokens }) => ({ op: tokens[0], crop: tokens[4] ?? null })),
        });
        at += autoCount + opCount;
    }
    return schedules;
}

export interface PlantCommunity {
    name: string;
    plants: { name: string; growing: string; line: number }[];
}

/** A `plant.ini`, as `readpcom.f90` reads it: each community, then its plants. */
export function parsePlantCommunities(text: string): PlantCommunity[] | null {
    const rows = dataRows(text, 2);
    const communities: PlantCommunity[] = [];
    let at = 0;
    while (at < rows.length) {
        const [name, count] = rows[at].tokens;
        const plants = Number(count);
        if (!Number.isInteger(plants) || at + 1 + plants > rows.length) {
            return null;
        }
        communities.push({
            name,
            plants: rows.slice(at + 1, at + 1 + plants).map(({ tokens, line }) => ({
                name: tokens[0],
                growing: (tokens[1] ?? '').toLowerCase(),
                line,
            })),
        });
        at += 1 + plants;
    }
    return communities;
}

/** Drop a Fortran comment, leaving any `!` inside a string alone. */
function code(line: string): string {
    let quote = '';
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
            quote = char === quote ? '' : quote;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '!') {
            return line.slice(0, index);
        }
    }
    return line;
}

export interface CaseBlock {
    labels: string[];
    line: number;
    body: string[];
}

/**
 * The `case` blocks of the `select case` whose selector matches, without those
 * of any `select case` nested inside it (`actions.f90` selects on `%option`
 * and `%ob` within action branches).
 */
export function caseBlocks(text: string, selector: RegExp): CaseBlock[] {
    const blocks: CaseBlock[] = [];
    let depth = 0;
    let target = 0;
    let current: CaseBlock | null = null;
    text.split(/\r?\n/).forEach((raw, index) => {
        const line = code(raw);
        if (/^\s*select\s+case\b/i.test(line)) {
            depth += 1;
            if (target === 0 && selector.test(line)) {
                target = depth;
                return;
            }
        } else if (/^\s*end\s*select\b/i.test(line)) {
            if (depth === target) {
                target = 0;
                current = null;
            }
            depth -= 1;
        } else if (target !== 0 && depth === target && /^\s*case\b/i.test(line)) {
            const labels = [...line.matchAll(/"([^"]*)"|'([^']*)'/g)].map(match => match[1] ?? match[2]);
            current = { labels, line: index + 1, body: [] };
            blocks.push(current);
            return;
        }
        (current as CaseBlock | null)?.body.push(line);
    });
    return blocks;
}

export interface ActionLookup {
    /** The `lum.dtl` column compared: `option` or `file_pointer`. */
    field: 'option' | 'file_pointer';
    /** What the match sets. `act_app` is optional: `actions.f90` tests it or applies nothing. */
    target: 'act_typ' | 'act_app';
    /** The variable compared against, without subscripts: `tilldb%tillnm`. */
    path: string;
}

export interface ActionRun {
    line: number;
    /** The branch reads `act_typ` or `act_app`, so it needs them set. */
    readsLookup: boolean;
    /** Every spelling the branch accepts. */
    labels: string[];
}

export interface ActionFacts {
    mapped: Map<string, ActionLookup[]>;
    run: Map<string, ActionRun>;
}

const ACTION_SELECT = /%act\(iac\)%typ\s*\)/i;

/** What one SWAT+ source does with each action name. `null`: these files have no such `select case`. */
export function actionFacts(dtblLumRead: string, actions: string): ActionFacts | null {
    const mapped = new Map<string, ActionLookup[]>();
    for (const block of caseBlocks(dtblLumRead, ACTION_SELECT)) {
        const lookups: ActionLookup[] = [];
        block.body.forEach((line, index) => {
            const compared = /%act\(iac\)%(option|file_pointer)\s*==\s*([\w%]+(?:\([^)]*\))?(?:%\w+)?)/i.exec(line);
            if (!compared) {
                return;
            }
            const assigned = block.body.slice(index + 1)
                .map(next => /%(act_typ|act_app)\(iac\)\s*=/i.exec(next))
                .find(Boolean);
            if (assigned) {
                lookups.push({
                    field: compared[1].toLowerCase() as ActionLookup['field'],
                    target: assigned[1].toLowerCase() as ActionLookup['target'],
                    path: compared[2].replace(/\([^)]*\)/g, ''),
                });
            }
        });
        block.labels.forEach(label => mapped.set(label, lookups));
    }
    const run = new Map<string, ActionRun>();
    for (const block of caseBlocks(actions, ACTION_SELECT)) {
        const readsLookup = block.body.some(line => /%act_(typ|app)\(iac\)/i.test(line));
        block.labels.forEach(label => run.set(label, { line: block.line, readsLookup, labels: block.labels }));
    }
    return mapped.size > 0 && run.size > 0 ? { mapped, run } : null;
}

type FileText = (defaultName: string) => string | null;

interface CheckOutcome {
    run: InputCheckRun;
    issues: InputIssue[];
}

function unrun(name: InputCheckRun['name'], state: 'skipped' | 'not_applicable', reason: string): CheckOutcome {
    return { run: { name, state, reason }, issues: [] };
}

/** The names a variable holds in a database file, cut to the length SWAT+ stores them at. */
function databaseNames(path: string, expectations: InputExpectations, text: FileText) {
    const ref = expectations.paths.get(path.toLowerCase());
    if (!ref) {
        return null;
    }
    const layout = expectations.layouts.get(ref.file.toLowerCase());
    if (!ref.perRow || !layout || layout.rows === 'sections') {
        return null;
    }
    const content = text(ref.file.toLowerCase());
    if (content === null) {
        return { file: ref.file, names: null };
    }
    const length = layout.fields[ref.index]?.length ?? undefined;
    const names = new Set(dataRows(content, layout.skippedLines).map(row => row.tokens[ref.index]?.slice(0, length)));
    return { file: ref.file, names };
}

function decisionTableCheck(
    tablesText: string | null,
    tables: DecisionTable[] | null,
    schedules: Schedule[] | null,
    context: InputCheckContext,
    text: FileText,
    named: (file: string) => boolean,
): CheckOutcome {
    const name = 'decision_tables';
    if (!named('lum.dtl')) {
        return unrun(name, 'not_applicable', 'file.cio names no lum.dtl');
    }
    if (tablesText === null) {
        return unrun(name, 'skipped', 'lum.dtl could not be read');
    }
    if (tables === null) {
        return unrun(name, 'skipped', 'lum.dtl does not have the shape dtbl_lum_read.f90 reads');
    }
    const source = context.source;
    if (!source?.dtblLumRead || !source.actions) {
        return unrun(name, 'skipped', source
            ? `${source.dir} has no src/dtbl_lum_read.f90 or src/actions.f90`
            : 'no SWAT+ source was given, and action names come from the source that will run');
    }
    const facts = actionFacts(source.dtblLumRead.text, source.actions.text);
    if (!facts) {
        return unrun(name, 'skipped', 'dtbl_lum_read.f90 or actions.f90 has no select case on the action type');
    }

    // A table no schedule names never runs, so what is wrong with it costs nothing yet.
    const inUse = schedules ? new Set(schedules.flatMap(item => item.autos.map(auto => auto.name))) : null;
    const severity = (names: string[], worst: InputIssueSeverity): InputIssueSeverity =>
        !inUse || names.some(item => inUse.has(item)) ? worst : 'note';
    const rowsBy = new Map<string, { table: string; action: DecisionAction }[]>();
    for (const table of tables) {
        for (const action of table.actions) {
            rowsBy.set(action.typ, [...(rowsBy.get(action.typ) ?? []), { table: table.name, action }]);
        }
    }

    const issues: InputIssue[] = [];
    const unchecked = new Set<string>();
    const describe = (rows: { table: string }[]) => {
        const names = [...new Set(rows.map(row => row.table))];
        const running = inUse ? names.filter(item => inUse.has(item)) : names;
        return {
            names,
            running,
            where: `${rows.length} row(s) in ${names.length} table(s): ${listed(names)}`
                + (inUse && running.length === 0 ? '; no schedule uses them' : ''),
        };
    };
    for (const [action, rows] of rowsBy) {
        const run = facts.run.get(action);
        const { names, running, where } = describe(rows);
        const first = rows[0].action.line;
        if (!run) {
            issues.push({
                kind: 'action_never_run',
                severity: severity(names, 'warning'),
                file: 'lum.dtl',
                line: first,
                message: `lum.dtl line ${first}: no branch of actions.f90 runs the action "${action}", so it never `
                    + `happens, with no message (${where}).`,
                action,
                tables: names,
                tables_in_use: running,
            });
            continue;
        }
        const mapped = facts.mapped.get(action);
        if (!mapped && run.readsLookup) {
            const known = run.labels.filter(label => facts.mapped.has(label));
            issues.push({
                kind: 'action_never_mapped',
                severity: severity(names, 'error'),
                file: 'lum.dtl',
                line: first,
                message: `lum.dtl line ${first}: actions.f90:${run.line} runs the action "${action}", but `
                    + 'dtbl_lum_read.f90 has no case for that spelling, so its lookup stays 0 and the action uses '
                    + `entry 0 of its database, not the row the file names (${where}).`
                    + (known.length ? ` The spelling dtbl_lum_read.f90 maps is "${known.join('", "')}".` : ''),
                action,
                tables: names,
                tables_in_use: running,
            });
        }
        // An unmapped spelling still names a row: the mapped spelling of the same branch says where.
        const lookups = mapped ?? run.labels.flatMap(label => facts.mapped.get(label) ?? []);
        for (const lookup of lookups) {
            const found = databaseNames(lookup.path, context.expectations, text);
            if (!found) {
                unchecked.add(`${action} ${lookup.field} (${lookup.path})`);
                continue;
            }
            const byValue = new Map<string, typeof rows>();
            for (const row of rows) {
                const value = lookup.field === 'option' ? row.action.option : row.action.filePointer;
                // An application method is optional: actions.f90 applies none when it stays 0.
                if (lookup.target === 'act_app' && value.toLowerCase() === 'null') {
                    continue;
                }
                byValue.set(value, [...(byValue.get(value) ?? []), row]);
            }
            for (const [value, valueRows] of byValue) {
                if (found.names?.has(value.slice(0, 40))) {
                    continue;
                }
                const about = describe(valueRows);
                const line = valueRows[0].action.line;
                // Without its row act_typ leaves the action nothing to do; act_app is an extra it goes on without.
                const required = lookup.target === 'act_typ';
                issues.push({
                    kind: 'option_not_in_database',
                    severity: severity(about.names, required ? 'error' : 'warning'),
                    file: 'lum.dtl',
                    line,
                    message: `lum.dtl line ${line}: the ${action} ${lookup.field} "${value}" is not in `
                        + (found.names ? found.file : `${found.file}, which the dataset does not have`)
                        + (required
                            ? ', so the action uses entry 0 of that database, not the row the file names'
                            : ', so the action runs without it')
                        + ` (${about.where}).`,
                    action,
                    option: value,
                    database: found.file,
                    tables: about.names,
                    tables_in_use: about.running,
                });
            }
        }
    }
    const reason = unchecked.size > 0
        ? `not looked up, no layout gives one name per row: ${listed([...unchecked])}`
        : null;
    return { run: { name, state: 'ran', reason }, issues };
}

function daysInYear(year: number): number {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export interface SimPeriod {
    startYear: number;
    startDay: number;
    endYear: number;
    endDay: number;
    days: number;
}

/** The period of a `time.sim`, with the zeros `time_read.f90` and `time_control.f90` give meaning to. */
export function simPeriod(text: string): SimPeriod | null {
    const [dayStart, startYear, dayEnd, endYear] = dataRows(text, 2)[0]?.tokens.map(Number) ?? [];
    if (![dayStart, startYear, dayEnd, endYear].every(Number.isInteger) || endYear < startYear) {
        return null;
    }
    const period: SimPeriod = {
        startYear,
        startDay: dayStart <= 0 ? 1 : dayStart,
        endYear,
        endDay: dayEnd <= 0 ? daysInYear(endYear) : Math.min(dayEnd, daysInYear(endYear)),
        days: 0,
    };
    period.days = daysThrough(period, endYear, period.endDay);
    return period;
}

/** How many days of the period fall on or before a date. */
function daysThrough(period: SimPeriod, year: number, day: number): number {
    if (year < period.startYear || (year === period.startYear && day < period.startDay)) {
        return 0;
    }
    if (period.days > 0 && (year > period.endYear || (year === period.endYear && day >= period.endDay))) {
        return period.days;
    }
    let count = day;
    for (let earlier = period.startYear; earlier < year; earlier += 1) {
        count += daysInYear(earlier);
    }
    return count - (period.startDay - 1);
}

const dayKey = (year: number, day: number) => year * 1000 + day;

interface WeatherRecord {
    first: number;
    last: number;
    days: number;
    flagged: number;
}

/**
 * A weather file's record within the period: title, header, one line of
 * station data, then a line per day (or per step, when `tstep` is above 0).
 * `null` when no dated line can be read. -97 and below means missing to SWAT+.
 */
export function scanWeather(text: string, period: SimPeriod): WeatherRecord | null {
    const lines = text.split(/\r?\n/);
    const skip = Number((lines[2] ?? '').trim().split(/\s+/)[1]) > 0 ? 5 : 2;
    const start = dayKey(period.startYear, period.startDay);
    const end = dayKey(period.endYear, period.endDay);
    const days = new Set<number>();
    const flagged = new Set<number>();
    let first = Infinity;
    let last = -Infinity;
    for (let index = 3; index < lines.length; index += 1) {
        const tokens = lines[index].trim().split(/\s+/);
        const key = dayKey(Number(tokens[0]), Number(tokens[1]));
        if (tokens.length <= skip || !Number.isInteger(key)) {
            continue;
        }
        first = Math.min(first, key);
        last = Math.max(last, key);
        if (key >= start && key <= end) {
            days.add(key);
            if (tokens.slice(skip).some(value => Number(value) <= -97)) {
                flagged.add(key);
            }
        }
    }
    return last < 0 ? null : { first, last, days: days.size, flagged: flagged.size };
}

const WEATHER_VARIABLES = [
    { variable: 'pcp', list: 'pcp.cli', station: 'pgage', index: 2, label: 'rain' },
    { variable: 'tmp', list: 'tmp.cli', station: 'tgage', index: 3, label: 'temperature' },
    { variable: 'slr', list: 'slr.cli', station: 'sgage', index: 4, label: 'solar radiation' },
    { variable: 'hmd', list: 'hmd.cli', station: 'hgage', index: 5, label: 'humidity' },
    { variable: 'wnd', list: 'wnd.cli', station: 'wgage', index: 6, label: 'wind' },
] as const;

function weatherCheck(context: InputCheckContext, text: FileText, named: (file: string) => boolean): CheckOutcome {
    const name = 'weather_coverage';
    const variables = WEATHER_VARIABLES.filter(item => named(item.list));
    if (!named('time.sim') || variables.length === 0) {
        return unrun(name, 'not_applicable', 'file.cio names no time.sim, or no measured weather');
    }
    const timeText = text('time.sim');
    const period = timeText === null ? null : simPeriod(timeText);
    if (!period) {
        return unrun(name, 'skipped', 'time.sim could not be read');
    }
    const stationText = text('weather-sta.cli');
    const stations = stationText === null ? null : dataRows(stationText, 2);
    const records = new Map<string, WeatherRecord | null>();
    const unread = new Set<string>();
    const issues: InputIssue[] = [];
    for (const item of variables) {
        const listText = text(item.list);
        if (listText === null) {
            unread.add(item.list);
            continue;
        }
        // What the stations use, which is what the model gets; the list when no station file says.
        const index = columnIndex(context.expectations, 'weather-sta.cli', item.station, item.index);
        const files = (stations ? stations.map(row => row.tokens[index]) : dataRows(listText, 2).map(row => row.tokens[0]))
            .filter(file => file && file.toLowerCase() !== 'sim' && file.toLowerCase() !== 'null');
        const ending = new Set<string>();
        const distinct = new Set<string>();
        const totals = { total: 0, flagged: 0, before: 0, after: 0, gaps: 0 };
        let latest = -Infinity;
        for (const file of files) {
            if (!records.has(file)) {
                const content = text(file.toLowerCase());
                records.set(file, content === null ? null : scanWeather(content, period));
            }
            const record = records.get(file);
            if (!record) {
                unread.add(file);
                continue;
            }
            distinct.add(file);
            latest = Math.max(latest, record.last);
            const lastYear = Math.floor(record.last / 1000);
            const lastDay = record.last % 1000;
            if (record.last < dayKey(period.endYear, period.endDay)) {
                ending.add(file);
            }
            const before = daysThrough(period, Math.floor(record.first / 1000), record.first % 1000 - 1);
            const after = period.days - daysThrough(period, lastYear, lastDay);
            totals.total += period.days;
            totals.flagged += record.flagged;
            totals.before += before;
            totals.after += after;
            totals.gaps += Math.max(0, period.days - before - after - record.days);
        }
        if (ending.size > 0) {
            const year = Math.floor(latest / 1000);
            const day = latest % 1000;
            const short = period.days - daysThrough(period, year, day);
            issues.push({
                kind: 'weather_ends_early',
                severity: 'warning',
                file: item.list,
                line: null,
                message: `${item.list}: ${ending.size} of ${distinct.size} ${item.label} files end before time.sim does. `
                    + `The latest record ends at ${year} day ${day} and time.sim runs to ${period.endYear} day `
                    + `${period.endDay}, so SWAT+ generates the last ${short} of ${period.days} simulated days.`,
                variable: item.variable,
                stations: files.length,
                files: distinct.size,
                files_ending_early: ending.size,
                last_record: { year, day },
                sim_end: { year: period.endYear, day: period.endDay },
                days_short: short,
            });
        }
        const missing = totals.flagged + totals.before + totals.after + totals.gaps;
        if (item.variable === 'pcp' && missing > 0) {
            const share = missing / totals.total;
            issues.push({
                kind: 'rain_days_missing',
                severity: 'warning',
                file: item.list,
                line: null,
                message: `Rain: ${(share * 100).toFixed(1)}% of the station-days in the simulated period have no value `
                    + `(${missing} of ${totals.total}): ${totals.flagged} flagged as missing, `
                    + `${totals.before + totals.after} outside the records` + (totals.gaps ? `, ${totals.gaps} gaps` : '')
                    + '. SWAT+ generates flagged and outside days'
                    + (totals.gaps ? ' and reads a gap as no rain' : '') + '.',
                variable: item.variable,
                stations: files.length,
                missing_days: missing,
                total_days: totals.total,
                missing_share: Math.round(share * 10000) / 10000,
                flagged_days: totals.flagged,
                days_before_records: totals.before,
                days_after_records: totals.after,
                gap_days: totals.gaps,
            });
        }
    }
    return {
        run: unread.size > 0
            ? { name, state: 'partial', reason: `${unread.size} weather file(s) could not be read: ${listed([...unread])}` }
            : { name, state: 'ran', reason: null },
        issues,
    };
}

/** The crops a schedule can start, and whether it can start one on the monsoon trigger. */
function startedBy(schedule: Schedule | undefined, tables: Map<string, DecisionTable>) {
    const crops = new Set<string>();
    let monsoon = false;
    for (const op of schedule?.ops ?? []) {
        if (op.op === 'plnt' && op.crop) {
            crops.add(op.crop);
        }
        monsoon ||= op.op === 'mons';
    }
    for (const auto of schedule?.autos ?? []) {
        // pl_hv_summer1, pl_hv_winter1 and pl_hv_summer2 take their crops from the schedule line.
        auto.crops.forEach(crop => crops.add(crop));
        for (const action of tables.get(auto.name)?.actions ?? []) {
            if (action.typ === 'plant') {
                crops.add(action.option);
            }
            monsoon ||= action.typ === 'pheno_reset';
        }
    }
    return { crops, monsoon };
}

function plantStartCheck(
    tables: DecisionTable[] | null,
    schedules: Schedule[] | null,
    context: InputCheckContext,
    text: FileText,
    named: (file: string) => boolean,
): CheckOutcome {
    const name = 'plant_starts';
    if (!named('plant.ini') || !named('landuse.lum') || !named('hru-data.hru')) {
        return unrun(name, 'not_applicable', 'file.cio names no plant.ini, landuse.lum or hru-data.hru');
    }
    const plantText = text('plant.ini');
    const landUseText = text('landuse.lum');
    const hruText = text('hru-data.hru');
    const communities = plantText === null ? null : parsePlantCommunities(plantText);
    if (!communities || landUseText === null || hruText === null) {
        return unrun(name, 'skipped', 'plant.ini, landuse.lum or hru-data.hru could not be read');
    }
    if (named('management.sch') && schedules === null) {
        return unrun(name, 'skipped', 'management.sch does not have the shape mgt_read_mgtops.f90 reads');
    }
    if (named('lum.dtl') && tables === null) {
        return unrun(name, 'skipped', 'lum.dtl does not have the shape dtbl_lum_read.f90 reads');
    }
    const { expectations } = context;
    const useIndex = columnIndex(expectations, 'hru-data.hru', 'land_use_mgt', 5);
    const hrus = new Map<string, number>();
    for (const { tokens } of dataRows(hruText, 2)) {
        hrus.set(tokens[useIndex], (hrus.get(tokens[useIndex]) ?? 0) + 1);
    }
    const communityIndex = columnIndex(expectations, 'landuse.lum', 'plant_cov', 2);
    const scheduleIndex = columnIndex(expectations, 'landuse.lum', 'mgt_ops', 3);
    const landUses = dataRows(landUseText, 2).map(({ tokens }) => ({
        name: tokens[0],
        community: tokens[communityIndex],
        schedule: tokens[scheduleIndex],
    }));
    // mons and pheno_reset start a moisture_gro crop with no planting.
    const trigIndex = columnIndex(expectations, 'plants.plt', 'trig', 2);
    const plantsText = text('plants.plt');
    const moisture = new Set((plantsText === null ? [] : dataRows(plantsText, 2))
        .filter(({ tokens }) => tokens[trigIndex] === 'moisture_gro').map(({ tokens }) => tokens[0]));
    const scheduleBy = new Map((schedules ?? []).map(item => [item.name, item]));
    const tableBy = new Map((tables ?? []).map(item => [item.name, item]));

    const issues: InputIssue[] = [];
    for (const community of communities) {
        for (const plant of community.plants.filter(item => item.growing === 'n')) {
            const dormant = landUses.filter(use => {
                if (use.community !== community.name || !hrus.get(use.name)) {
                    return false;
                }
                const { crops, monsoon } = startedBy(scheduleBy.get(use.schedule), tableBy);
                return !crops.has(plant.name) && !(monsoon && moisture.has(plant.name));
            });
            if (dormant.length === 0) {
                continue;
            }
            const count = dormant.reduce((sum, use) => sum + (hrus.get(use.name) ?? 0), 0);
            issues.push({
                kind: 'crop_never_planted',
                severity: 'warning',
                file: 'plant.ini',
                line: plant.line,
                message: `plant.ini line ${plant.line}: ${plant.name} (${community.name}) starts as n and nothing plants `
                    + `it on ${count} HRU(s), so it never grows there. No plnt operation or plant action names it in `
                    + listed(dormant.map(use => `${use.name} (schedule ${use.schedule})`)) + '.',
                crop: plant.name,
                community: community.name,
                land_uses: dormant.map(use => use.name),
                schedules: [...new Set(dormant.map(use => use.schedule))],
                hrus: count,
            });
        }
    }
    return { run: { name, state: 'ran', reason: null }, issues };
}

/** Every check across files. `read` returns a file's text by its file.cio name. */
export function runCrossChecks(
    namedFiles: NamedFile[],
    read: (file: string) => DatasetFile,
    context: InputCheckContext,
): { checks: InputCheckRun[]; issues: InputIssue[] } {
    const nameOf = new Map(namedFiles.map(item => [item.file.toLowerCase(), item.file]));
    const cache = new Map<string, string | null>();
    // Weather files are not on file.cio rows, so a name not found there is read as it stands.
    const text: FileText = lower => {
        if (!cache.has(lower)) {
            const found = read(nameOf.get(lower) ?? lower);
            cache.set(lower, found.kind === 'text' ? found.text : null);
        }
        return cache.get(lower) ?? null;
    };
    const named = (file: string) => nameOf.has(file);

    const tablesText = named('lum.dtl') ? text('lum.dtl') : null;
    const tables = tablesText === null ? null : parseDecisionTables(tablesText);
    const schedulesText = named('management.sch') ? text('management.sch') : null;
    const schedules = schedulesText === null ? null : parseSchedules(schedulesText);

    const outcomes = [
        decisionTableCheck(tablesText, tables, schedules, context, text, named),
        weatherCheck(context, text, named),
        plantStartCheck(tables, schedules, context, text, named),
    ];
    return { checks: outcomes.map(item => item.run), issues: outcomes.flatMap(item => item.issues) };
}
