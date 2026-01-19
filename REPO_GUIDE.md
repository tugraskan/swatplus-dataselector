# Repository Guide

This file provides a short description of every top-level item and key subdirectory contents so you can quickly understand why each piece exists.

## Top-level files

- **CHANGELOG.md**: Tracks user-visible changes between releases of the VS Code extension.
- **HIERARCHICAL_FILES_IMPLEMENTATION.md**: Describes the design and implementation details for handling hierarchical SWAT+ files in the indexer.
- **IMPLEMENTATION_SUMMARY.md**: Summarizes the major implementation steps and decisions taken for the extension.
- **PANDAS_REFACTORING_SUMMARY.md**: Records the refactoring work that introduced/expanded the pandas-backed indexer workflow.
- **README.md**: Main project overview, feature list, and usage instructions.
- **SCHEMA_ENHANCEMENT_SUMMARY.md**: Summary of the schema enhancement work, including markdown-derived metadata and tests.
- **SCHEMA_IMPLEMENTATION.md**: Deep dive into how schema extraction is implemented and how to regenerate it.
- **TROUBLESHOOTING.md**: Common issues and fixes when using or developing the extension.
- **vsc-extension-quickstart.md**: Boilerplate VS Code extension quickstart content and reminders.
- **esbuild.js**: Build script for bundling the extension with esbuild.
- **eslint.config.mjs**: ESLint configuration for linting the TypeScript codebase.
- **package.json**: NPM metadata, scripts, extension manifest, and dependencies.
- **package-lock.json**: Locked dependency tree for reproducible installs.
- **tsconfig.json**: TypeScript compiler configuration for the extension.
- **.gitignore**: Git ignore rules for build outputs and local artifacts.
- **.vscodeignore**: Packaging ignore rules for publishing the VS Code extension.
- **.vscode-test.mjs**: Test runner setup for VS Code extension tests.

## Top-level directories

- **.git/**: Local Git metadata for version control (not part of the shipped extension).
- **.github/**: Repository-level helper files; currently contains editor/assistant guidance.
  - **copilot-instructions.md**: Guidance for code assistants on project conventions.
- **.vscode/**: Local VS Code workspace settings and helper tasks for contributors.
  - **extensions.json**: Recommended VS Code extensions.
  - **launch.json**: Debug configurations for the extension.
  - **settings.json**: Workspace-specific editor settings.
  - **tasks.json**: Build/test tasks for local development.
- **docs/**: Long-form project documentation and analyses for schema and indexing.
  - **COMPLETE_DEPENDENCY_MAP.md**: Comprehensive dependency map of SWAT+ files and relationships.
  - **DEPENDENCY_ANALYSIS.md**: Narrative analysis of dependencies and foreign key relationships.
  - **DOCUMENTATION_ANALYSIS.md**: Review of available SWAT+ documentation sources and coverage.
  - **ENHANCED_INDEXING.md**: Guide to the enhanced indexing workflow and capabilities.
  - **EXTENSION_FILE_SCHEMA.md**: Detailed schema reference for SWAT+ input files.
  - **FILE_RELATIONSHIPS.md**: Summary of file relationship rules and linking behavior.
  - **INPUT_SCHEMA_RELATIONSHIPS.md**: Generated document describing schema relationships.
  - **METADATA_USAGE.md**: How schema metadata is consumed within the extension.
  - **QUICK_REFERENCE.md**: Quick lookup guide for common files and fields.
  - **SCHEMA_ENHANCEMENT.md**: Explains the schema enhancement pipeline and inputs.
  - **schema/**: Subsection containing schema-specific documentation artifacts.
    - **INPUT_FILES_GITBOOK_URLS.md**: Mapping of input files to GitBook URLs.
    - **INPUT_FILES_STRUCTURE.md**: High-level documentation of SWAT+ input file structure.
    - **SWAT_INPUT_FILE_STRUCTURE.md**: Alternative or expanded structural breakdown of input files.
    - **readme.md**: Overview for the docs/schema subfolder.
- **node_modules/**: Installed NPM dependencies (generated via `npm install`, not source of truth).
- **resources/**: Assets and schema data bundled with the extension.
  - **splus-activitybar-cutout.svg**: Activity bar icon asset.
  - **splus-icon-light-128.png**: Light theme icon asset.
  - **schema/**: JSON schema and metadata used by the extension.
    - **enhanced-schema-from-markdown.json**: Schema data derived from markdown parsing.
    - **gitbook-urls.json**: Mapping of schema items to GitBook documentation URLs.
    - **swatplus-editor-schema-full.json**: Full schema extracted from swatplus-editor models.
    - **swatplus-editor-schema.json**: Primary schema consumed by the extension (full set).
    - **txtinout-metadata-enhanced.json**: Enhanced metadata merged with schema details.
    - **txtinout-metadata.json**: Base metadata for SWAT+ input/output files.
    - **txtinout-metadata.json.backup**: Backup copy of metadata during enhancement work.
- **scripts/**: One-off and repeatable helper scripts for schema generation and analysis.
  - **README.md**: Documentation for the scripts in this folder.
  - **add_con_files_to_schema.py**: Injects/consolidates CON-related file data into schema metadata.
  - **extract_all_models.py**: Dynamically extracts the schema from swatplus-editor Peewee models.
  - **generate_input_schema_relationships_doc.py**: Builds the INPUT_SCHEMA_RELATIONSHIPS.md doc from schema data.
  - **merge_schema_metadata.py**: Merges metadata sources into the main schema JSON files.
  - **pandas_indexer.py**: Pandas-powered index builder used by the extension for fast indexing.
  - **parse_gitbook_urls.py**: Scrapes/normalizes GitBook URLs into a JSON mapping.
  - **parse_schema_md.py**: Parses markdown schema docs into structured metadata.
  - **requirements.txt**: Python dependencies for the scripts (not needed for extension runtime).
  - **test_enhanced_schema.py**: Test script for validating enhanced schema outputs.
- **src/**: TypeScript source code for the VS Code extension.
  - **extension.ts**: Entry point that registers commands and extension activation.
  - **fkDecorations.ts**: Adds editor decorations for foreign key references.
  - **fkDefinitionProvider.ts**: Enables “Go to Definition” for FK targets.
  - **fkDiagnostics.ts**: Emits diagnostics/warnings for missing or invalid FK references.
  - **fkHoverProvider.ts**: Provides hover tooltips for FK and schema info.
  - **fkReferencesPanel.ts**: Webview panel for browsing incoming/outgoing references.
  - **indexer.ts**: Core indexing pipeline for parsing SWAT+ datasets.
  - **pathUtils.ts**: Path and filesystem helpers shared across the extension.
  - **singleTableViewerPanel.ts**: Webview panel for viewing a single table’s rows.
  - **swatView.ts**: Tree view model for the SWAT+ dataset view.
  - **swatWebviewProvider.ts**: Webview provider for the dataset selection UI.
  - **tableViewerPanel.ts**: Webview panel for browsing tables in a dataset.
  - **test/**: Extension test suite.
    - **extension.test.ts**: Tests for extension activation and basic command wiring.
    - **hierarchical.test.ts**: Tests for hierarchical file parsing/indexing behavior.
