import * as assert from 'assert';
import {
    describePlan,
    describeResult,
    formatHeadline,
    formatRange,
    formatRangeLine,
    formatRetainedCounts,
    formatSummaryLines,
    PlanResult,
    SubsetResult
} from '../summary';

const result: SubsetResult = {
    ok: true,
    source_dir: 'C:\\Data\\02070009',
    output_dir: 'C:\\Data\\02070009_subset_20260905_070809',
    hru_ids: [1532, 1538, 3978],
    keep_routing: true,
    retained_counts: { hru: 7, ru: 7, res: 10, aqu: 6, sdc: 439, out: 7 },
    added_hru_ids: [
        { hru_id: 1802, reason: 'channel 404 had only channel inflows; its HRU 1802 was added', channel_id: 404 },
        { hru_id: 2891, reason: 'channel 608 had only channel inflows; its HRU 2891 was added', channel_id: 608 }
    ],
    workarounds_applied: ['W1', 'W2']
};

suite('Result summary', () => {
    test('shows the HRU range as "N HRUs (min–max)"', () => {
        assert.strictEqual(formatRange({ total_hrus: 4123, min_hru: 1, max_hru: 4123 }), '4123 HRUs (1\u20134123)');
    });

    test('names the kept objects in the order the script reports them', () => {
        assert.strictEqual(
            formatRetainedCounts(result.retained_counts),
            '7 HRUs, 7 routing units, 10 reservoirs, 6 aquifers, 439 channels (SWAT-DEG), 7 outlets'
        );
        assert.strictEqual(formatRetainedCounts({ hru: 3, zzz: 2, ru: 0 }), '3 HRUs, 2 zzz');
        assert.strictEqual(formatRetainedCounts(undefined), 'nothing reported');
    });

    test('lists the added HRUs with their reasons and the workarounds applied', () => {
        const lines = formatSummaryLines(result);
        assert.deepStrictEqual(lines, [
            'Output: C:\\Data\\02070009_subset_20260905_070809',
            'Dataset: C:\\Data\\02070009',
            'Requested HRUs: 1532,1538,3978 (3)',
            'Routing: downstream routing kept',
            'Kept: 7 HRUs, 7 routing units, 10 reservoirs, 6 aquifers, 439 channels (SWAT-DEG), 7 outlets',
            'Added feeder HRUs (2), W1:',
            '  HRU 1802: channel 404 had only channel inflows; its HRU 1802 was added',
            '  HRU 2891: channel 608 had only channel inflows; its HRU 2891 was added',
            'Workarounds applied: W1 (feeder HRUs added), W2 (wetland file aligned)'
        ]);
    });

    test('says so when nothing was added or applied', () => {
        const lines = formatSummaryLines({
            ...result,
            keep_routing: false,
            hru_ids: [5],
            added_hru_ids: [],
            workarounds_applied: [],
            retained_counts: { hru: 1 }
        });
        assert.ok(lines.includes('Routing: HRUs only'));
        assert.ok(lines.includes('Workarounds applied: none'));
        assert.ok(!lines.some(line => line.startsWith('Added feeder HRUs')));
    });

    test('keeps an unknown workaround id as it is', () => {
        const lines = formatSummaryLines({ ...result, added_hru_ids: undefined, workarounds_applied: ['W9'] });
        assert.ok(lines.includes('Workarounds applied: W9'));
    });

    test('headline counts the kept HRUs and the feeders', () => {
        assert.strictEqual(formatHeadline(result), 'Subset created with 7 HRUs (2 feeder HRUs added)');
        assert.strictEqual(
            formatHeadline({ ...result, retained_counts: { hru: 1 }, added_hru_ids: [result.added_hru_ids![0]] }),
            'Subset created with 1 HRU (1 feeder HRU added)'
        );
        assert.strictEqual(
            formatHeadline({ ...result, retained_counts: undefined, added_hru_ids: [] }),
            'Subset created with 3 HRUs'
        );
    });

    test('the range line under the dataset box', () => {
        assert.strictEqual(formatRangeLine({ total_hrus: 4222, min_hru: 1, max_hru: 4222 }), 'HRUs 1–4222 (4222 total)');
        assert.strictEqual(formatRangeLine({ total_hrus: 3, min_hru: 5, max_hru: 9 }), 'HRUs 5–9 (3 total)');
    });

    suite('plan and result views', () => {
        const plan: PlanResult = {
            ok: true,
            plan: true,
            source_dir: result.source_dir,
            hru_ids: result.hru_ids,
            keep_routing: true,
            retained_counts: result.retained_counts,
            added_hru_ids: result.added_hru_ids,
            workarounds_applied: ['W1', 'W2'],
            warnings: []
        };

        test('a plan reads as what will be kept, with the feeder HRUs and their reasons', () => {
            const view = describePlan(plan);
            assert.strictEqual(view.headline, 'Will keep 7 HRUs (2 feeder HRUs added)');
            assert.strictEqual(view.requested, '3 picked + 2 feeder');
            assert.strictEqual(view.kept, '7 HRUs, 7 routing units, 10 reservoirs, 6 aquifers, 439 channels (SWAT-DEG), 7 outlets');
            assert.deepStrictEqual(view.added, [
                { hruId: 1802, reason: 'channel 404 had only channel inflows; its HRU 1802 was added' },
                { hruId: 2891, reason: 'channel 608 had only channel inflows; its HRU 2891 was added' }
            ]);
            assert.deepStrictEqual(view.workarounds, ['W1 (feeder HRUs added)', 'W2 (wetland file aligned)']);
            assert.deepStrictEqual(view.warnings, []);
        });

        test('a result is the same view plus the folders', () => {
            const view = describeResult(result);
            assert.strictEqual(view.headline, 'Created a subset with 7 HRUs (2 feeder HRUs added)');
            assert.strictEqual(view.outputDir, result.output_dir);
            assert.strictEqual(view.sourceDir, result.source_dir);
            assert.deepStrictEqual(view.added, describePlan(plan).added);
        });

        test('a plan and a run of the same settings read the same except for the verb', () => {
            const a = describePlan(plan);
            const b = describeResult(result);
            assert.strictEqual(a.kept, b.kept);
            assert.strictEqual(a.requested, b.requested);
            assert.deepStrictEqual(a.added, b.added);
            assert.deepStrictEqual(a.workarounds, b.workarounds);
            assert.deepStrictEqual(a.warnings, b.warnings);
        });

        test('without feeder HRUs there is nothing to list and the line stays short', () => {
            const view = describePlan({ ...plan, added_hru_ids: [], workarounds_applied: [], retained_counts: { hru: 1 }, hru_ids: [5] });
            assert.strictEqual(view.headline, 'Will keep 1 HRU');
            assert.strictEqual(view.requested, '1 picked');
            assert.deepStrictEqual(view.added, []);
            assert.deepStrictEqual(view.workarounds, []);
        });

        test('warnings from the script are carried through', () => {
            const view = describePlan({ ...plan, warnings: ['2 kept channel(s) have only channel inflows (3, 5).'] });
            assert.deepStrictEqual(view.warnings, ['2 kept channel(s) have only channel inflows (3, 5).']);
            assert.deepStrictEqual(describeResult({ ...result, warnings: ['x'] }).warnings, ['x']);
        });

        test('without a count of HRUs the picked and added ones are added up', () => {
            const view = describePlan({ ...plan, retained_counts: undefined });
            assert.strictEqual(view.headline, 'Will keep 5 HRUs (2 feeder HRUs added)');
            assert.strictEqual(view.kept, 'nothing reported');
        });
    });
});
