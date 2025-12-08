# SWAT+ Editor Schema Changes - Quick Reference

This is a condensed guide for quick reference. For detailed information, see [SCHEMA_AND_SCRIPTS.md](../SCHEMA_AND_SCRIPTS.md).

## What Changes When SWAT+ Editor Updates?

### Database Schema Changes
- ✏️ New tables added for new features
- 📝 Existing tables modified (columns added/removed)
- 🔄 Data types or constraints updated
- 📊 Default values may change

### Script Changes
- 📄 File format changes (`.bsn`, `.con`, `.hru`, etc.)
- ➕ New parameters added to files
- ➖ Deprecated parameters removed
- 🔍 Validation rules updated

### File.cio Changes
- New file sections
- Removed file sections
- Changed file descriptions
- Different file ordering

## Quick Decision Guide

### Should I upgrade my dataset?

```
┌─ New SWAT+ Editor version released
│
├─ Is it a major version change? (e.g., 2.x → 3.x)
│  └─ YES → Strongly recommend upgrading
│     - Backup dataset first
│     - Open in new editor (auto-migration)
│     - Update your model code to match
│
├─ Is it a minor version change? (e.g., 3.0 → 3.1)
│  └─ CONSIDER → Evaluate based on:
│     - New features you need
│     - Bug fixes included
│     - Time available for testing
│
└─ Is it a patch version? (e.g., 3.0.11 → 3.0.12)
   └─ OPTIONAL → Usually just bug fixes
      - Safe to skip if current version works
      - Upgrade when convenient
```

### What if my debugging fails?

```
❌ Error: "Invalid file format" or "Missing parameter"

Likely causes:
1. Dataset version ≠ Model version
2. File.cio references missing files
3. Parameter format changed

Quick fix:
→ Check SWAT+ Editor version used to create dataset
→ Verify your model executable version matches
→ Try opening dataset in SWAT+ Editor (validates files)
→ Run SWAT+ Check to identify specific issues
```

## Version Compatibility Matrix

| Your Dataset | SWAT+ Editor | Model Version | This Extension | Status |
|-------------|--------------|---------------|----------------|---------|
| v2.x dataset | v2.x Editor | v60.5.x Model | Any version | ✅ Compatible |
| v2.x dataset | v3.x Editor | v61.x Model | Any version | ⚠️ Upgrade dataset first |
| v3.x dataset | v2.x Editor | v60.5.x Model | Any version | ❌ Incompatible |
| v3.x dataset | v3.x Editor | v61.x Model | Any version | ✅ Compatible |

## Common Scenarios

### Scenario: Team member uses different editor version

```bash
Problem: Dataset works for them, not for you

Solution:
1. Ask which SWAT+ Editor version they used
2. Install the same version OR
3. Upgrade dataset to your version (coordinate with team)
4. Document required version in project README
```

### Scenario: Downloaded example dataset from SWAT+ website

```bash
Problem: Example dataset version unknown

Solution:
1. Check SWAT+ website for dataset version info
2. Open dataset in your SWAT+ Editor
3. Allow migration if prompted
4. Note any warnings/errors
5. Save (rewrites all files to current version)
```

### Scenario: Schema change during active development

```bash
Problem: Mid-project, new editor version released

Decision tree:
│
├─ Critical bug fix in new version?
│  └─ YES → Upgrade (backup first)
│
├─ New feature you need?
│  └─ YES → Upgrade (backup first)
│
└─ Otherwise
   └─ NO → Finish current work, upgrade later
```

## File Types and Schema Sensitivity

| File Type | Schema Sensitive | Can Edit Manually | Notes |
|-----------|------------------|-------------------|-------|
| `project.db` | ⚠️ Very High | ❌ No | Use SWAT+ Editor |
| `file.cio` | ⚠️ High | ⚠️ Careful | Master config |
| `*.bsn`, `*.con` | ⚠️ Medium | ✅ Yes | Parameter files |
| `*.cli`, `*.pcp` | ✅ Low | ✅ Yes | Weather data |
| `*.txt` (output) | ✅ Low | 👁️ View only | Model output |

## Emergency Procedures

### Broken dataset after upgrade

```bash
1. Restore from backup
2. Note error messages
3. Check SWAT+ Editor changelog for breaking changes
4. Search user group for similar issues
5. Try migration in steps if available
```

### Can't run model after editing files

```bash
1. Open dataset in SWAT+ Editor
2. Run SWAT+ Check (validates everything)
3. Review errors/warnings
4. Fix issues or revert changes
5. Save in editor (regenerates files)
```

### Need to downgrade dataset

```bash
⚠️ Not officially supported!

Options:
1. Restore old backup
2. Recreate dataset from scratch in old editor
3. Manual file editing (advanced users only)
4. Check user group for migration tools
```

## Best Practices Summary

✅ **DO:**
- Backup datasets before upgrading
- Document editor version in project
- Test after schema changes
- Use SWAT+ Editor for validation
- Keep model version synchronized

❌ **DON'T:**
- Mix datasets from different versions
- Edit database files manually
- Skip migration warnings
- Forget to test after upgrades
- Ignore version compatibility

## Resources

- 📚 [Full Documentation](../SCHEMA_AND_SCRIPTS.md)
- 🔗 [SWAT+ Editor](https://github.com/swat-model/swatplus-editor)
- 📖 [SWAT+ Docs](https://swatplus.gitbook.io/docs)
- 💬 [User Group](https://groups.google.com/g/swatplus-editor)
- 📝 [Release Notes](https://swatplus.gitbook.io/docs/release-notes)

## Quick Commands

### Check SWAT+ Editor version
- Windows: Help → About
- macOS: SWAT+ Editor → About
- Linux: Help → About

### Check dataset schema version
```python
# If project.db exists
sqlite3 project.db "SELECT version FROM metadata;"
```

### Verify file.cio structure
```bash
# Quick check for key files
grep -E "\.(bsn|con|sim)" file.cio
```

---

**Remember:** This extension is file-system level. It doesn't enforce schema compatibility, but your SWAT+ model executable does!
