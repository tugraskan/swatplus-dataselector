#!/usr/bin/env python3
"""
Parse GitBook URL mappings from INPUT_FILES_GITBOOK_URLS.md.

Extracts the table mapping of file names to GitBook documentation URLs.
"""

import json
import re
from pathlib import Path


def parse_gitbook_urls_table(md_path: Path) -> dict:
    """
    Parse the markdown file to extract the table URL mapping.
    
    Returns:
        Dictionary mapping file names to GitBook URLs
    """
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract table data using regex
    # Pattern: | `filename` | Category | [URL](actual_url) |
    pattern = r'\| `([^`]+)` \| ([^|]+) \| \[https://[^\]]+\]\((https://[^)]+)\) \|'
    matches = re.findall(pattern, content)
    
    # Build a mapping of filename to URL
    url_map = {}
    for filename, category, url in matches:
        # Only keep actual file entries (not category headers)
        # Files should have extensions or be special cases like 'file.cio'
        if '.' in filename or filename in ['file.cio']:
            if filename not in url_map:  # Keep first occurrence
                url_map[filename] = url
    
    return url_map


def get_default_url(md_path: Path) -> str:
    """
    Extract the default URL for files without specific documentation.
    
    Returns:
        Default GitBook URL
    """
    # Default URL for SWAT+ I/O documentation
    return "https://swatplus.gitbook.io/io-docs/introduction-1/"


def generate_url_json(output_path: Path):
    """
    Generate a JSON file with GitBook URL mappings for use by the extension.
    """
    script_dir = Path(__file__).parent
    md_path = script_dir.parent / 'docs' / 'schema' / 'INPUT_FILES_GITBOOK_URLS.md'
    
    if not md_path.exists():
        print(f"Error: {md_path} not found")
        return False
    
    # Parse the markdown file
    url_mapping = parse_gitbook_urls_table(md_path)
    default_url = get_default_url(md_path)
    
    # Create output structure
    output = {
        "description": "GitBook documentation URLs for SWAT+ input files",
        "source": "docs/schema/INPUT_FILES_GITBOOK_URLS.md",
        "default_url": default_url,
        "file_urls": url_mapping
    }
    
    # Write to JSON file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Generated {output_path}")
    print(f"  - {len(url_mapping)} file URLs mapped")
    print(f"  - Default URL: {default_url}")
    
    return True


def main():
    """Main entry point."""
    script_dir = Path(__file__).parent
    output_path = script_dir.parent / 'resources' / 'schema' / 'gitbook-urls.json'
    
    if generate_url_json(output_path):
        return 0
    else:
        return 1


if __name__ == '__main__':
    exit(main())
