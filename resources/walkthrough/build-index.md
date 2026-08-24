# Build the inputs index

The index is what makes cross-file navigation, hovers, and validation work. It reads
every input file in the dataset, resolves the foreign keys between them, and builds a
reverse index so incoming references can be listed.

Run **Build Index** from the SWAT+ Dataset view, or **SWAT+: Build Inputs Index** from
the Command Palette.

## Requirements

Indexing runs a Python helper, so you need:

- Python 3.6 or newer on your `PATH` (or set the `SWATPLUS_PYTHON` environment
  variable to a specific interpreter)
- `pandas` 2.2 or newer — `pip install -r scripts/requirements.txt`

If a prerequisite is missing, the **Build Index** button explains what to install
rather than failing partway through.

## After the build

The index is cached as `index.json` inside the dataset, and reloaded automatically the
next time you select that dataset — you only pay the build cost once.

If input files change on disk afterwards, the view shows an **Index out of date**
banner with a one-click **Rebuild**, so navigation never quietly drifts out of sync
with your files.
