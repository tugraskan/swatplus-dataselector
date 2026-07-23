# Plan 03 — `@swat` chat participant

**Theme:** user value · **Effort:** M · **Priority:** high

## Why

The dataset engine (`src/datasetEngineCore.ts`) and MCP server
(`src/mcp/server.ts`) already answer "describe hru 81", "what references this
soil", "what does this column mean". The MCP server requires client config. A
**VS Code chat participant** brings the same capability into the built-in chat
panel with zero setup and no API keys, using VS Code's Language Model API.

## Goal

A `@swat` chat participant so a user can type, in the VS Code chat panel:
- *"@swat describe hru 81"*
- *"@swat which HRUs use soil_01-h1?"*
- *"@swat what does epco mean in hydrology.hyd?"*

and get grounded answers backed by the engine, against the currently indexed
dataset.

## Design

Reuse the engine — do **not** duplicate logic.

1. **Register the participant** (`vscode.chat.createChatParticipant`) in
   `src/extension.ts`, id `swatplus.chat`, with a handler.
2. **Expose the engine as language-model tools** via `vscode.lm.registerTool` (or
   pass them as `tools` in the chat request), wrapping the existing
   `SwatDatasetEngine` methods (`describeEntity`, `findReferences`, `lookupDocs`,
   plus a `list_entities`). These mirror the MCP tools 1:1 — factor the tool
   definitions into a shared module so MCP (`src/mcp/server.ts`) and the chat
   participant register the same set.
3. **Handler flow:** take the user prompt, run a tool-calling loop with the selected
   model (`request.model`), let the model call the engine tools, and stream the
   result back. The engine returns compact markdown, ideal for streaming.
4. **Grounding guardrails:** the system prompt instructs the model to answer only
   from tool output and to say when the index isn't built or an entity isn't found.
   If `!indexer.isIndexBuilt()`, respond with a prompt to build the index first.
5. **Slash commands** (optional): `/describe`, `/references`, `/docs` for direct,
   model-free tool calls when the user wants a deterministic answer.

## Deliverables

- `src/chatParticipant.ts` — participant + handler.
- `src/engineTools.ts` — shared tool definitions (name, description, zod/JSON
  schema, handler) consumed by both the chat participant and `src/mcp/server.ts`
  (refactor the MCP server to import them).
- `package.json` contributes: `chatParticipants` entry for `@swat`, and `languageModelTools`
  if registering tools declaratively.
- Docs: a short section in `README.md` / `docs/MCP_SERVER.md` cross-linking the two
  ways to query (chat vs MCP).

## Acceptance

- With an indexed dataset, `@swat describe hru 81` returns the same content as the
  `describe_entity` MCP tool / the Describe Entity command.
- With no index, the participant explains how to build one instead of erroring.
- The MCP server and chat participant share one tool-definition module (no drift).

## Notes

- No API keys: the Language Model API uses the user's configured Copilot/VS Code
  model. Handle the "no model available" case gracefully.
