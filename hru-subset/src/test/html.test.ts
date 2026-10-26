import * as assert from 'assert';
import { escapeHtml, makeNonce, PANEL_ELEMENT_IDS, panelHtml, PICKER_ELEMENT_IDS, pickerHtml } from '../html';
import { OPTION_CHOICES } from '../options';
import { COLUMNS } from '../picker/model';
import { isPanelMessage, isPickerInbound } from '../protocol';

const input = { nonce: 'abc123', scriptUri: 'vscode-resource://x/dist/panel.js', title: 'SWAT+ HRU Subset' };

suite('Webview pages', () => {
    test('escapes text for HTML', () => {
        assert.strictEqual(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });

    test('a nonce is 32 letters or digits and differs between calls', () => {
        const a = makeNonce();
        assert.match(a, /^[A-Za-z0-9]{32}$/);
        assert.notStrictEqual(a, makeNonce());
        assert.strictEqual(makeNonce(() => 0), 'A'.repeat(32));
    });

    for (const [name, html] of [['panel', panelHtml(input)], ['picker', pickerHtml(input)]] as const) {
        test(`the ${name} page allows only its own nonce'd script and style`, () => {
            assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-abc123'; script-src 'nonce-abc123'; img-src data:;">/);
            assert.match(html, /<script nonce="abc123" src="vscode-resource:\/\/x\/dist\/panel.js"><\/script>/);
            assert.match(html, /<style nonce="abc123">/);
            assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline script');
            assert.ok(!/\son(click|load|input|change)=/i.test(html), 'no inline handlers');
        });
    }

    test('the panel page has every element its script looks up', () => {
        const html = panelHtml(input);
        for (const id of PANEL_ELEMENT_IDS) {
            assert.ok(html.includes(`id="${id}"`), `#${id}`);
        }
        for (const choice of OPTION_CHOICES) {
            assert.ok(html.includes(`id="opt-${choice.key}"`), `#opt-${choice.key}`);
        }
        const ids = Array.from(html.matchAll(/ id="([^"]+)"/g)).map(match => match[1]);
        assert.strictEqual(new Set(ids).size, ids.length, 'ids are unique');
    });

    test('the panel has the controls of the Dataset Selector panel and the new ones', () => {
        const html = panelHtml(input);
        for (const text of [
            'Dataset', 'Browse…', "Use Dataset Selector's dataset", 'HRU IDs', 'Pick HRUs…', 'placeholder="1,4-6,10"',
            'Keep routing', 'Add feeder HRUs', 'Align wetland file', 'SWAT+ main/dev compatibility', 'Turn all outputs off',
            'Output folder', 'Create Subset', 'Preview'
        ]) {
            assert.ok(html.includes(text), text);
        }
        // Run SWAT+ is gone.
        assert.ok(!/Run SWAT\+/i.test(html));
    });

    test("Dataset Selector's button starts hidden, so it shows only when the extension says so", () => {
        assert.match(panelHtml(input), /<button[^>]*id="useSelector" hidden/);
    });

    test('the keep routing control is a switch and the other four are checkboxes, with the help text', () => {
        const html = panelHtml(input);
        assert.match(html, /<label class="toggle"[^>]*><input type="checkbox" data-option="keepRouting"/);
        assert.strictEqual((html.match(/class="option-check"/g) ?? []).length, 4);
        for (const choice of OPTION_CHOICES) {
            assert.ok(html.includes(escapeHtml(choice.help)), choice.key);
        }
    });

    test('the picker page has every element its script looks up and room for every column', () => {
        const html = pickerHtml(input);
        for (const id of PICKER_ELEMENT_IDS) {
            assert.ok(html.includes(`id="${id}"`), `#${id}`);
        }
        const width = COLUMNS.reduce((sum, column) => sum + column.width, 0);
        assert.ok(html.includes(`min-width:${width}px`));
        assert.ok(html.includes('Use selection'));
    });

    suite('messages', () => {
        test('the panel only accepts the messages it knows, with the fields they need', () => {
            assert.strictEqual(isPanelMessage({ type: 'ready' }), true);
            assert.strictEqual(isPanelMessage({ type: 'ids', text: '1-3' }), true);
            assert.strictEqual(isPanelMessage({ type: 'ids' }), false);
            assert.strictEqual(isPanelMessage({ type: 'options', options: {} }), true);
            assert.strictEqual(isPanelMessage({ type: 'options' }), false);
            assert.strictEqual(isPanelMessage({ type: 'runSwat' }), false, 'Run SWAT+ is not a message any more');
            assert.strictEqual(isPanelMessage({ type: 'nope' }), false);
            assert.strictEqual(isPanelMessage(null), false);
            assert.strictEqual(isPanelMessage('ready'), false);
            assert.strictEqual(isPanelMessage({}), false);
        });

        test('the picker only accepts the messages it knows', () => {
            assert.strictEqual(isPickerInbound({ type: 'useSelection', ids: '1-3,7' }), true);
            assert.strictEqual(isPickerInbound({ type: 'useSelection' }), false);
            assert.strictEqual(isPickerInbound({ type: 'rendered', rows: 4222, shown: 4222 }), true);
            assert.strictEqual(isPickerInbound({ type: 'rendered', rows: '4222' }), false);
            assert.strictEqual(isPickerInbound({ type: 'ready' }), true);
            assert.strictEqual(isPickerInbound(undefined), false);
        });
    });
});
