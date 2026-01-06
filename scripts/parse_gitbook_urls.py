#!/usr/bin/env python3
"""
Parse GitBook URL mappings from INPUT_FILES_GITBOOK_URLS.md.

Extracts the JSON mapping of file names to GitBook documentation URLs.
"""

import json
import re
from pathlib import Path


def parse_gitbook_urls(md_path: Path) -> dict:
    """
    Parse the markdown file to extract the JSON URL mapping.
    
    Returns:
        Dictionary mapping file names to GitBook URLs
    """
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract JSON block from markdown
    # Look for ```json ... ``` blocks
    json_pattern = r'```json\s*\n(.*?)\n```'
    matches = re.findall(json_pattern, content, re.DOTALL)
    
    if not matches:
        print("Warning: No JSON block found in markdown file")
        return {}
    
    # Parse the first JSON block (the main mapping)
    try:
        url_mapping = json.loads(matches[0])
        return url_mapping
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        return {}


def get_default_url(md_path: Path) -> str:
    """
    Extract the default URL for files without specific documentation.
    
    Returns:
        Default GitBook URL
    """
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Look for the default URL in the "Default URL" section
    default_pattern = r'For files without specific documentation:\s*```\s*\n(https://[^\n]+)\s*\n```'
    match = re.search(default_pattern, content)
    
    if match:
        return match.group(1)
    
    # Fallback default
    return "https://swatplus.gitbook.io/docs/"


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
    url_mapping = parse_gitbook_urls(md_path)
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
