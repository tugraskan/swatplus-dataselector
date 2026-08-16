# Explore results

After a model run, the **Outputs** section of the SWAT+ Dataset view lists what was
written. Type in its filter box to narrow a long list of output files by name.

- **Click** an output file to open it as a DataFrame, with sortable columns and
  filtering — no need to hand-parse fixed-width text.
- **SWAT+: Generate Output Notebooks** creates Jupyter notebooks wired up to your
  output files, ready for plotting.
- Right-click any output for **Explore Output File** or **Open File in Editor**.

## Working on a smaller model

Full watersheds are slow to iterate on. **SWAT+: Create HRU Subset** copies the
TxtInOut folder and keeps only the HRUs you name (`1,4-6,10`), optionally preserving
downstream routing, and makes the reduced copy the active dataset. Your original
dataset is never modified.

**SWAT+: Create HRU Subset and Run** does the same and immediately runs SWAT+ against
the subset.

## Asking questions

Type `@swat` in the Chat view to ask about the indexed dataset — "describe HRU 81",
"which HRUs use this soil?". The same engine is available to external agents through
the bundled MCP server.
