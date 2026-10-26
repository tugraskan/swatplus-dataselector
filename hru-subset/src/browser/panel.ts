// The sidebar panel's script. It runs in the webview, keeps no state of its own
// beyond what the user is typing, and draws whatever the extension sends (see
// controller.ts). Bundled to dist/panel.js by esbuild; type-checked with
// tsconfig.browser.json.

import type { PanelMessage, PanelOutbound, PanelViewState, PreviewState, RunState } from '../protocol';
import type { OptionKey, SubsetOptions } from '../options';
import type { SummaryView } from '../summary';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const host = acquireVsCodeApi();

function send(message: PanelMessage): void {
    host.postMessage(message);
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`HRU Subset panel: missing element #${id}`);
    }
    return element as T;
}

const OPTION_KEYS: OptionKey[] = ['keepRouting', 'feederHrus', 'alignWetlands', 'mainCompat', 'noOutputs'];

const datasetInput = el<HTMLInputElement>('datasetInput');
const idsInput = el<HTMLInputElement>('idsInput');
const outputInput = el<HTMLInputElement>('outputInput');
const optionBoxes = new Map<OptionKey, HTMLInputElement>(
    OPTION_KEYS.map(key => [key, el<HTMLInputElement>(`opt-${key}`)])
);

let lastRevision = 0;
const applied = { dataset: -1, ids: -1, output: -1 };
let current: PanelViewState | undefined;

// ---- drawing -------------------------------------------------------------------------

function setText(id: string, text: string | undefined): void {
    el(id).textContent = text ?? '';
}

function clear(node: HTMLElement): void {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function make<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: { className?: string; text?: string; title?: string } = {},
    children: Array<Node | string> = []
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (options.className) {
        node.className = options.className;
    }
    if (options.text !== undefined) {
        node.textContent = options.text;
    }
    if (options.title) {
        node.title = options.title;
    }
    for (const child of children) {
        node.append(child);
    }
    return node;
}

function button(text: string, onClick: () => void, className = 'action-button secondary small'): HTMLButtonElement {
    const node = make('button', { className, text });
    node.addEventListener('click', onClick);
    return node;
}

function labelled(label: string, value: string): HTMLElement {
    return make('div', { className: 'summary-line' }, [make('span', { className: 'summary-label', text: `${label}: ` }), value]);
}

/** The lines both the preview and the result show: kept counts, added HRUs, workarounds, warnings. */
function summaryNodes(view: SummaryView, addedTitle: string): Node[] {
    const nodes: Node[] = [labelled('Kept', view.kept), labelled('HRUs', view.requested)];
    if (view.added.length > 0) {
        nodes.push(make('div', { className: 'summary-line summary-label', text: `${addedTitle} (${view.added.length}):` }));
        nodes.push(make('ul', { className: 'added-list' }, view.added.map(item =>
            make('li', {}, [make('b', { text: `HRU ${item.hruId}` }), `: ${item.reason}`])
        )));
    }
    nodes.push(labelled('Workarounds', view.workarounds.length > 0 ? view.workarounds.join(', ') : 'none'));
    for (const warning of view.warnings) {
        nodes.push(make('div', { className: 'warn-text', text: `Warning: ${warning}` }));
    }
    return nodes;
}

function renderPreview(preview: PreviewState): void {
    const box = el('previewBox');
    const body = el('previewBody');
    clear(body);
    box.hidden = preview.kind === 'off';
    switch (preview.kind) {
        case 'off':
            return;
        case 'waiting':
            body.append(make('div', { className: 'muted', text: preview.reason }));
            return;
        case 'loading':
            body.append(make('div', { className: 'muted' }, [make('span', { className: 'spinner' }), 'Asking the script what will be kept…']));
            return;
        case 'error':
            body.append(make('div', { className: 'error-text', text: preview.message }));
            return;
        case 'ready':
            body.append(make('div', { className: 'summary-label', text: preview.view.headline }), ...summaryNodes(preview.view, 'Feeder HRUs that will be added'));
            return;
    }
}

function renderRun(run: RunState): void {
    const area = el('results');
    clear(area);
    area.className = 'results';
    area.hidden = run.kind === 'idle' || run.kind === 'running';
    if (run.kind === 'done') {
        area.classList.add('done');
        const view = run.view;
        area.append(
            make('h3', { text: view.headline }),
            make('div', { className: 'summary-line' }, [make('span', { className: 'summary-label', text: 'Output: ' }), make('span', { className: 'path', text: view.outputDir })]),
            ...summaryNodes(view, 'Feeder HRUs added'),
            ...(run.note ? [make('div', { className: 'muted summary-line', text: run.note })] : []),
            make('div', { className: 'button-row' }, [
                button('Open Folder', () => send({ type: 'openFolder' }), 'action-button primary small'),
                button('Reveal in Explorer', () => send({ type: 'reveal' })),
                button('Show Log', () => send({ type: 'showLog' })),
                button('Dismiss', () => send({ type: 'dismissResult' }))
            ])
        );
    } else if (run.kind === 'failed') {
        area.classList.add('failed');
        area.append(make('h3', { text: run.cancelled ? 'Cancelled' : 'Creating the subset failed' }), make('div', { className: 'error-text', text: run.message }));
        if (run.partialOutput) {
            area.append(
                make('div', { className: 'summary-line' }, ['The run left a partly made folder: ', make('span', { className: 'path', text: run.partialOutput })]),
                make('div', { className: 'button-row' }, [button('Delete Partial Output', () => send({ type: 'deletePartial' }), 'action-button primary small')])
            );
        }
        if (run.info) {
            area.append(make('div', { className: 'muted summary-line', text: run.info }));
        }
        area.append(make('div', { className: 'button-row' }, [button('Show Log', () => send({ type: 'showLog' })), button('Dismiss', () => send({ type: 'dismissResult' }))]));
    }
}

function render(state: PanelViewState): void {
    current = state;
    try {
        drawState(state);
    } finally {
        send({ type: 'rendered', revision: state.revision });
    }
}

function drawState(state: PanelViewState): void {
    setText('version', `v${state.toolVersion}`);

    if (state.dataset.inputRevision !== applied.dataset) {
        datasetInput.value = state.dataset.input;
        applied.dataset = state.dataset.inputRevision;
    }
    if (state.ids.revision !== applied.ids) {
        idsInput.value = state.ids.text;
        applied.ids = state.ids.revision;
    }
    if (state.output.revision !== applied.output) {
        outputInput.value = state.output.text;
        applied.output = state.output.revision;
    }

    setText('datasetError', state.dataset.error);
    setText('datasetWarning', state.dataset.warning);
    setText('datasetNote', state.dataset.loading ? 'Reading the dataset…' : state.dataset.note);
    setText('datasetResolved', state.dataset.resolvedFolder ? `Using ${state.dataset.resolvedFolder}` : '');
    setText('rangeLine', state.dataset.loading ? '' : state.dataset.rangeLine);
    el('useSelector').hidden = !state.selectorAvailable;
    setText('idsError', state.ids.error);
    setText('outputError', state.output.error);
    setText('outputNote', state.output.note);

    for (const key of OPTION_KEYS) {
        const box = optionBoxes.get(key);
        if (box) {
            box.checked = state.options[key];
            const locked = state.busy || (key === 'feederHrus' && !state.options.keepRouting);
            box.disabled = locked;
            const row = box.closest('.option-check');
            row?.classList.toggle('disabled', locked);
        }
    }

    datasetInput.disabled = state.busy;
    idsInput.disabled = state.busy;
    outputInput.disabled = state.busy;
    el<HTMLButtonElement>('browseDataset').disabled = state.busy;
    el<HTMLButtonElement>('useSelector').disabled = state.busy;
    el<HTMLButtonElement>('browseOutput').disabled = state.busy || !state.canPick;
    el<HTMLButtonElement>('pickHrus').disabled = !state.canPick;
    el<HTMLButtonElement>('previewBtn').disabled = !state.canPreview || state.preview.kind === 'loading';
    el<HTMLButtonElement>('createBtn').disabled = !state.canCreate;
    el('createBtn').hidden = state.busy;
    el('cancelBtn').hidden = !state.busy;
    el('createBtn').textContent = 'Create Subset';
    setText('pythonLine', state.python.text);

    renderPreview(state.preview);
    renderRun(state.run);
    if (state.busy) {
        const area = el('results');
        clear(area);
        area.className = 'results';
        area.hidden = false;
        area.append(make('div', { className: 'muted' }, [make('span', { className: 'spinner' }), 'Creating the subset… the script is copying and filtering the files.']));
    }
}

// ---- events --------------------------------------------------------------------------

function currentOptions(): SubsetOptions {
    const read = (key: OptionKey): boolean => optionBoxes.get(key)?.checked ?? false;
    return {
        keepRouting: read('keepRouting'),
        feederHrus: read('feederHrus'),
        alignWetlands: read('alignWetlands'),
        mainCompat: read('mainCompat'),
        noOutputs: read('noOutputs')
    };
}

datasetInput.addEventListener('change', () => send({ type: 'datasetInput', text: datasetInput.value }));
datasetInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        send({ type: 'datasetInput', text: datasetInput.value });
    }
});
idsInput.addEventListener('input', () => send({ type: 'ids', text: idsInput.value }));
idsInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && current?.canCreate) {
        send({ type: 'create' });
    }
});
outputInput.addEventListener('input', () => send({ type: 'outputInput', text: outputInput.value }));
for (const box of optionBoxes.values()) {
    box.addEventListener('change', () => send({ type: 'options', options: currentOptions() }));
}
el('browseDataset').addEventListener('click', () => send({ type: 'browseDataset' }));
el('useSelector').addEventListener('click', () => send({ type: 'useSelectorDataset' }));
el('pickHrus').addEventListener('click', () => send({ type: 'pickHrus' }));
el('previewBtn').addEventListener('click', () => send({ type: 'preview' }));
el('browseOutput').addEventListener('click', () => send({ type: 'browseOutput' }));
el('createBtn').addEventListener('click', () => send({ type: 'create' }));
el('cancelBtn').addEventListener('click', () => send({ type: 'cancel' }));

window.addEventListener('message', event => {
    const message = event.data as PanelOutbound | undefined;
    if (message && message.type === 'state' && message.state.revision > lastRevision) {
        lastRevision = message.state.revision;
        render(message.state);
    }
});

send({ type: 'ready' });
