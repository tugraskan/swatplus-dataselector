/**
 * `@swat` chat participant.
 *
 * Answers questions about the indexed SWAT+ dataset in the VS Code chat panel,
 * grounded in the dataset engine. It runs a tool-calling loop with the user's
 * selected language model, exposing the shared {@link ENGINE_TOOLS} as private
 * tools (the same set the MCP server registers), and streams the model's answer
 * back. No API keys — it uses the model the user already has.
 */

import * as vscode from 'vscode';
import { SwatIndexer } from './indexer';
import { SwatDatasetEngine } from './datasetEngine';
import { ENGINE_TOOLS, getEngineTool } from './engineTools';

const PARTICIPANT_ID = 'swatplus.chat';
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = [
    'You are a SWAT+ dataset assistant embedded in a VS Code extension.',
    'Answer questions about the user\'s indexed SWAT+ dataset using ONLY the provided tools.',
    'Prefer describe_entity for "tell me about X", find_references / find_orphans for relationships,',
    'query_rows for "find rows where…", and lookup_docs for "what does column Y mean".',
    'Resolve friendly names: "hru 81" means entity="hru", id="81".',
    'Ground every factual claim in tool output. If a tool reports nothing found or an unresolved',
    'entity, say so plainly rather than guessing. Keep answers concise and cite file:line when the',
    'tool output includes it.',
].join(' ');

export function registerSwatChatParticipant(
    context: vscode.ExtensionContext,
    indexer: SwatIndexer,
    engine: SwatDatasetEngine,
): void {
    // The chat API may be unavailable in older hosts; fail soft.
    if (!vscode.chat?.createChatParticipant) {
        return;
    }

    const handler: vscode.ChatRequestHandler = async (request, _ctx, stream, token) => {
        if (!indexer.isIndexBuilt()) {
            stream.markdown('No SWAT+ index is loaded yet. Run **SWAT+: Build Inputs Index** on a dataset, then ask again.');
            return;
        }

        const host = engine.getToolHost();
        const lmTools: vscode.LanguageModelChatTool[] = ENGINE_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        }));

        const messages: vscode.LanguageModelChatMessage[] = [
            vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
            vscode.LanguageModelChatMessage.User(request.prompt),
        ];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            if (token.isCancellationRequested) {
                return;
            }
            const response = await request.model.sendRequest(messages, { tools: lmTools }, token);

            const toolCalls: vscode.LanguageModelToolCallPart[] = [];
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    stream.markdown(part.value);
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    toolCalls.push(part);
                }
            }

            if (toolCalls.length === 0) {
                return; // final answer already streamed
            }

            // Run the requested tools locally and feed results back to the model.
            const assistantParts: vscode.LanguageModelToolCallPart[] = [];
            const resultParts: vscode.LanguageModelToolResultPart[] = [];
            for (const call of toolCalls) {
                const def = getEngineTool(call.name);
                let text: string;
                try {
                    text = def
                        ? def.invoke(host, (call.input ?? {}) as Record<string, unknown>)
                        : `Unknown tool: ${call.name}`;
                } catch (err) {
                    text = `Tool ${call.name} failed: ${err instanceof Error ? err.message : String(err)}`;
                }
                assistantParts.push(call);
                resultParts.push(new vscode.LanguageModelToolResultPart(
                    call.callId, [new vscode.LanguageModelTextPart(text)]));
            }
            messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
            messages.push(vscode.LanguageModelChatMessage.User(resultParts));
        }

        stream.markdown('\n\n_(Stopped after several tool calls without a final answer — try a more specific question.)_');
    };

    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    context.subscriptions.push(participant);
}
