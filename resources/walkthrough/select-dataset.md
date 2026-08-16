# Select a dataset

A **dataset** is the folder that holds your SWAT+ model inputs — the one containing
`file.cio`, either directly or inside a `TxtInOut` subfolder.

Pick one in any of these ways:

- Open the **SWAT+ Dataset** view in the activity bar and choose an entry from
  **Workspace Folder** or **Recent Datasets**.
- Run **SWAT+: Select Dataset Folder** from the Command Palette to browse for one.
- Right-click any folder in the Explorer and choose **Use as SWAT+ Dataset**.
- Drag a folder onto the **SWAT+ Dataset** view.

The active dataset is shown in the status bar; click it any time to switch.

By default the view lists dataset folders found in `workdata/` relative to your
workspace root. Point it somewhere else with the `swatplus.datasetDirectory` setting,
or the folder button in the **Workspace Folder** section header.

Datasets you return to often can be pinned to the top of **Recent Datasets** with the
star button.
