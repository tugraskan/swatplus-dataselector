import re
import sys

if len(sys.argv) < 2:
    print("Usage: python check_septic.py <path-to-septic.sep> [expected_columns]")
    sys.exit(1)

path = sys.argv[1]
expected = int(sys.argv[2]) if len(sys.argv) > 2 else 13

bad = []
total = 0
blank = 0
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f, 1):
        s = line.rstrip('\n\r')
        if not s.strip():
            blank += 1
            continue
        # Skip comment lines often starting with # or ';'
        if s.strip().startswith('#') or s.strip().startswith(';'):
            continue
        cols = re.split(r'\s+', s.strip())
        total += 1
        if len(cols) != expected:
            bad.append((i, len(cols), s))

print(f"Checked: {path}")
print(f"Data lines examined: {total}")
print(f"Blank/comment lines skipped: {blank}")
print(f"Lines with != {expected} columns: {len(bad)}")
if bad:
    print("\nFirst 50 problematic lines (line_number, column_count):")
    for entry in bad[:50]:
        ln, cnt, text = entry
        snippet = text if len(text) < 300 else text[:297] + '...'
        print(f"{ln}: {cnt} cols -> {snippet}")
