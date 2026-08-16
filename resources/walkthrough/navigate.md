# Navigate the model

With an index built, SWAT+ input files behave like source code.

- **Ctrl+Click** (**Cmd+Click** on macOS) a foreign key value to jump to the row it
  references — an HRU pointing at a soil, a channel pointing at its hydrology record.
- **Ctrl+Click** a filename in `file.cio` to open that file.
- **Hover** any value to see the column's meaning, units, type, and default, plus the
  SWAT+ source line it came from.
- Run **SWAT+: Show FK References** to list everything pointing *at* the current row.

## Seeing the whole picture

- **SWAT+: View Tables** opens the dataset as browsable tables.
- **SWAT+: Show Dependency Graph** draws the table-to-table relationships.
- **SWAT+: Describe Entity** summarises one object — try `hru 81`.
- **SWAT+: Search Dataset** finds rows by predicate, such as `slope > 0.1`, or lists
  orphan rows nothing references.

## Checking quality

Unresolved references are underlined in the editor and reported in the Problems panel.
The health strip at the top of the SWAT+ Dataset view keeps the unresolved count in
view; click it to generate a full data quality report.

**SWAT+: Check Input Files** separately validates headers, column counts, data types,
and required values left empty.
