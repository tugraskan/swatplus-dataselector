#!/usr/bin/env python3
"""Syntax-check the JavaScript embedded in webview HTML template literals.

The webview panels build their HTML — including a sizeable inline <script> — as
TypeScript template literals. Neither tsc nor eslint parses the JavaScript inside
those strings, so a syntax error there type-checks and bundles cleanly and only
surfaces as a blank, silently broken panel at runtime.

This script extracts each inline script block, substitutes the ${...}
interpolations with a literal, and runs `node --check` over the result.

Usage:  python3 scripts/check_webview_scripts.py
Exit code is non-zero if any block fails to parse.
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import tempfile

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"

SCRIPT_BLOCK = re.compile(r"<script(?:\s+nonce=\"\$\{nonce\}\")?\s*>(.*?)</script>", re.S)
# Matches ${...} with one level of nested braces, which covers the interpolations
# used in these templates (including ${JSON.stringify({...})}).
INTERPOLATION = re.compile(r"\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}")


def check_file(path: pathlib.Path) -> list[str]:
    """Return a list of failure messages for one source file."""
    failures: list[str] = []
    text = path.read_text(encoding="utf-8")

    for index, match in enumerate(SCRIPT_BLOCK.finditer(text)):
        js = INTERPOLATION.sub("null", match.group(1))
        if not js.strip():
            continue

        line_no = text[: match.start()].count("\n") + 1

        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(js)
            tmp_name = handle.name

        try:
            result = subprocess.run(
                ["node", "--check", tmp_name],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "").strip()
                failures.append(
                    f"{path.relative_to(SRC.parent)}:{line_no} (script block {index + 1})\n{detail}"
                )
        finally:
            pathlib.Path(tmp_name).unlink(missing_ok=True)

    return failures


def main() -> int:
    failures: list[str] = []
    checked = 0

    for path in sorted(SRC.glob("*.ts")):
        if not SCRIPT_BLOCK.search(path.read_text(encoding="utf-8")):
            continue
        checked += 1
        failures.extend(check_file(path))

    if failures:
        print("Embedded webview script syntax errors:\n", file=sys.stderr)
        for failure in failures:
            print(failure, file=sys.stderr)
            print("", file=sys.stderr)
        return 1

    print(f"Embedded webview scripts OK ({checked} file(s) checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
