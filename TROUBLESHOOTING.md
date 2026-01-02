# Troubleshooting SWAT+ Dataset Selector

## file.cio Navigation Not Working

If Go-to-Definition (Ctrl+Click) is not working in file.cio, follow these steps:

### 1. Verify Extension is Active

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Developer: Show Running Extensions"
4. Look for "SWAT+ Dataset Selector" in the list
5. If not found, the extension may not be installed or activated

### 2. Check File Location

The extension only works on files in the TxtInOut directory:

1. Ensure file.cio is in a folder named `TxtInOut` or in the root dataset folder
2. The extension looks for files in:
   - `<dataset>/TxtInOut/file.cio`
   - `<dataset>/file.cio`

### 3. Build the Index

Navigation requires building the index first:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `SWAT+: Build Inputs Index`
3. Select your dataset folder when prompted
4. Wait for the "Index built successfully" message

### 4. Check Output Channel

To see detailed logs:

1. Open VS Code Output panel (`Ctrl+Shift+U` or View > Output)
2. Select "SWAT+ FK Navigation" from the dropdown
3. Open file.cio and try clicking on a filename
4. Check the output for diagnostic messages

Expected output when clicking:
```
[FK Definition] Triggered at <path>/file.cio:<line>:<char>
[FK Definition] File: file.cio
[FK Definition] file.cio special handling - target: hru-data.hru
[FK Definition] File found: <path>/TxtInOut/hru-data.hru
[FK Definition] Success - navigating to file
```

### 5. Verify file.cio Format

The extension expects file.cio in this format:

```
Title: Master SWAT+ Input Files
hru-data.hru
soils.sol
landuse.lum
climate/weather-sta.cli
...
```

- Line 1: Title/description
- Line 2+: One filename per line (or classification + filename)
- The extension auto-detects filenames by looking for values with dots (e.g., `.hru`, `.sol`)

### 6. Test with Output Channel Open

1. Open Output panel and select "SWAT+ FK Navigation"
2. Open file.cio in your TxtInOut folder
3. Hover over a filename (e.g., `hru-data.hru`)
4. You should see a tooltip with file purpose
5. Ctrl+Click the filename
6. Check output for diagnostic messages

### 7. Reload Extension

If changes were recently pulled:

1. Press `Ctrl+Shift+P`
2. Run: `Developer: Reload Window`
3. This ensures the latest compiled extension is loaded

### 8. Check File Extensions

The extension is registered for these file patterns:
- `**/TxtInOut/**` (all files in TxtInOut directory)
- `**/*.cio` (all .cio files anywhere)

If file.cio is not in TxtInOut or doesn't have .cio extension, it won't work.

### 9. Verify Schema is Loaded

1. Check that `resources/schema/swatplus-editor-schema.json` exists
2. Check that `resources/schema/txtinout-metadata.json` exists
3. These files should be in the extension folder

### 10. Common Issues

**Issue**: Clicking does nothing
- **Solution**: Build the index first (`SWAT+: Build Inputs Index`)

**Issue**: Hover shows nothing
- **Solution**: Ensure you're hovering over a filename (has a dot like `.hru`)

**Issue**: Navigation goes to wrong file
- **Solution**: Check that the referenced file exists in TxtInOut folder

**Issue**: Extension not recognized
- **Solution**: Reload window or restart VS Code

## Getting Help

If none of the above works:

1. Check the Output channel "SWAT+ FK Navigation" for error messages
2. Check the VS Code Extension Host log: `Ctrl+Shift+P` > "Developer: Show Logs" > "Extension Host"
3. Provide the output logs when reporting issues

## Feature Checklist

After building the index, you should have:

- ✅ Ctrl+Click on FK values navigates to target
- ✅ Ctrl+Click on filenames in file.cio opens that file
- ✅ Hover shows FK target file and purpose
- ✅ Hover on file.cio filenames shows file purpose
- ✅ Warning diagnostics for unresolved FK references
- ✅ Visual underlines on FK values

If any of these don't work, the extension may not be fully activated.
