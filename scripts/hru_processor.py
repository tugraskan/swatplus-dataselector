#!/usr/bin/env python3
"""Create reduced SWAT+ TxtInOut folders for selected HRUs.

The extension uses this as a dependency-free sidecar. It vendors the useful
core behavior from SWATPLUS_HRU_Processor and replaces the Tkinter GUI with a
small CLI that returns JSON.
"""

from __future__ import annotations

import argparse
import contextlib
from collections import deque
from datetime import datetime
import fnmatch
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any


OBJ_TYPE_FILES = {
    "hru": ("hru.con", "hru-data.hru"),
    "ru": ("rout_unit.con", "rout_unit.rtu"),
    "sdc": ("chandeg.con", "channel-lte.cha"),
    "cha": ("channel.con", "channel.cha"),
    "aqu": ("aquifer.con", "aquifer.aqu"),
    "res": ("reservoir.con", "reservoir.res"),
    "rec": ("recall.con", "recall.rec"),
    "exc": ("exco.con", None),
    "dr": ("delratio.con", None),
    "out": ("outlet.con", None),
}

COUNT_COLUMN_ALIASES = {
    "obj": ("obj", "objs"),
    "hru": ("hru",),
    "hru_lte": ("lhru", "hru_lte", "hrulte", "hlt"),
    "ru": ("rtu", "ru"),
    "gwflow": ("gwfl", "gwflow"),
    "aqu": ("aqu",),
    "cha": ("cha", "chan"),
    "res": ("res",),
    "recall": ("rec", "recall"),
    "exco": ("exco",),
    "dr": ("dlr", "dr", "del"),
    "canal": ("can", "canal"),
    "pump": ("pmp", "pump"),
    "outlet": ("out", "outlet"),
    "chandeg": ("lcha", "chandeg", "sdc"),
    "aqu2d": ("aqu2d",),
    "herd": ("hrd", "herd"),
    "wro": ("wro",),
}

OBJECT_TYPE_TO_COUNT_KEY = {
    "hru": "hru",
    "hlt": "hru_lte",
    "hru_lte": "hru_lte",
    "ru": "ru",
    "gwflow": "gwflow",
    "aqu": "aqu",
    "cha": "cha",
    "res": "res",
    "rec": "recall",
    "recall": "recall",
    "exc": "exco",
    "exco": "exco",
    "dr": "dr",
    "out": "outlet",
    "outlet": "outlet",
    "sdc": "chandeg",
    "chandeg": "chandeg",
}

COUNT_KEYS = tuple(key for key in COUNT_COLUMN_ALIASES if key != "obj")

# Hydrograph type written on the pseudo edges the tracer adds for routing-unit
# membership (an element reaches the channels through the unit that lists it).
MEMBERSHIP_EDGE = "elem"

# print.prt object names that only NAM_Branch accepts (it reads the file by
# position); main/dev validate every name and stop on these.
NAM_ONLY_PRINT_OBJECTS = {"basin_sed_bud"}

# Files in file.cio's REGIONS block that carry object numbers. Element files
# list objects (OBJ_TYP, OBJ_TYP_NO) and are renumbered together with the
# definition file that lists their element ids; the remaining region files are
# nulled in file.cio when they hold data, because the subset has no stable
# numbering for what they group.
REGION_UNIT_FILES = (
    ("ls_reg.ele", "ls_reg.def"),
    ("ch_catunit.ele", "ch_catunit.def"),
    ("aqu_catunit.ele", "aqu_catunit.def"),
    ("res_catunit.ele", "res_catunit.def"),
    ("rec_catunit.ele", "rec_catunit.def"),
)
REGION_NULLABLE_FILES = (
    "ls_cal.reg",
    "ch_reg.def",
    "aqu_reg.def",
    "res_reg.def",
    "rec_reg.def",
)

# SWAT+ checkouts the workarounds below were confirmed against.
SWAT_BRANCH_COMMITS = {
    "NAM_Branch": "6efcee0",
    "main": "6f51536",
    "dev": "16ea369",
}

# Every workaround the tool applies for a SWAT+ defect, so each one can be
# removed once SWAT+ is fixed. scripts/SWAT_WORKAROUNDS.md is rendered from this
# list (render_workarounds_markdown) and `--check-swat-source` greps the patterns.
#
# A bug entry names a file under the checkout's src/ folder and a regular
# expression (also valid for `grep -E`, case-insensitive) that matches the
# defective line. `fixed_pattern`, when set, matches code that shows the defect
# was fixed. `locations` lists file:line per branch where it was confirmed.
SWAT_WORKAROUNDS: list[dict[str, Any]] = [
    {
        "id": "W1",
        "title": "Feeder HRUs",
        "flag": "--exact-hrus",
        "default": "on for --keep-routing; --exact-hrus turns it off",
        "tool_does": (
            "After tracing, finds kept channels whose inflows are all other channels. For each, it looks up "
            "the routing unit(s) that feed that channel in the full dataset and adds one HRU element of that "
            "unit, then traces again until no such channel is left. The added HRUs are reported as "
            "added_hru_ids with a reason each."
        ),
        "bugs": [
            {
                "summary": (
                    "ch_temp reads hin_d(in-1), index 0, when the first inflow of a channel is another channel. "
                    "sd_channel_control3 calls ch_temp unconditionally. In the full dataset every channel also "
                    "has a routing-unit inflow, so only subsets hit it (forrtl 408, HIN_D 0)."
                ),
                "file": "ch_temp.f90",
                "pattern": r"trib1_temp *= *ob\(iob\)%hin_d\(in-1\)",
                "locations": {"main": "ch_temp.f90:145", "dev": "ch_temp.f90:148"},
            }
        ],
        "remove_when": (
            "ch_temp.f90 no longer reads hin_d(in-1) for the first inflow (or skips the tributary mixing when "
            "the first inflow is a channel). Then drop add_feeder_hrus from RoutingTracer, the --exact-hrus "
            "flag, and the extension option."
        ),
    },
    {
        "id": "W2",
        "title": "Compact hydrology.wet",
        "flag": "--keep-wetland-file",
        "default": "on in both modes; --keep-wetland-file turns it off",
        "tool_does": (
            "Keeps only the hydrology.wet rows that the kept HRUs' wetlands refer to (hru-data.hru SURF_STOR "
            "-> wetland.wet HYD -> hydrology.wet), in their original order, so every row number is at most "
            "the HRU count."
        ),
        "bugs": [
            {
                "summary": (
                    "et_act indexes wet_hyd with the hydrology.wet row (wet_dat%hyd). wet_hyd is per HRU "
                    "(sized sp_ob%hru, filled at wet_initial.f90:81) but the row can be larger than the HRU "
                    "count in a subset. main stops with WET_HYD subscript 27 > upper bound 3; NAM reads past "
                    "the array and gets junk (wetland ET = 0). Compacting keeps the row inside the array, "
                    "though it can still read another HRU's entry (default evrsv 0.7) until SWAT+ is fixed."
                ),
                "file": "et_act.f90",
                "pattern": r"es_max *= *wet_hyd\(ihyd\)",
                "locations": {
                    "NAM_Branch": "et_act.f90:143",
                    "main": "et_act.f90:142",
                    "dev": "et_act.f90:142",
                },
            }
        ],
        "remove_when": (
            "et_act.f90 reads the wetland's own hydrology (for example wet_hyddb(ihyd) or a per-HRU copy "
            "indexed by the HRU) instead of wet_hyd(ihyd). Then drop compact_hydrology_wet and the "
            "--keep-wetland-file flag."
        ),
    },
    {
        "id": "W3",
        "title": "main/dev compatibility (water allocation off, NAM-only print.prt rows removed)",
        "flag": "--main-compat",
        "default": "off (opt-in)",
        "tool_does": (
            "Sets the file.cio WATER_RIGHTS line to `null null null`, creates an empty file named `null` in "
            "the subset when missing, and removes print.prt object rows whose names only NAM_Branch "
            "accepts (today: basin_sed_bud)."
        ),
        "bugs": [
            {
                "summary": (
                    "water_allocation_read has an inverted check: `.not. i_exist .or. in_wallo%pou /= \"null\"` "
                    "reads the file when it does not exist or when the name is not \"null\". A subset also "
                    "removes the objects water allocation uses (pou_ex1.wal/pod_ex1.wal in the 02070009 "
                    "dataset point at aquifer 1 and channels 2 and 15)."
                ),
                "file": "water_allocation_read.f90",
                "pattern": r"\.not\. *i_exist *\.or\. *in_wallo%pou",
                "locations": {
                    "main": "water_allocation_read.f90:38",
                    "dev": "water_allocation_read.f90:38",
                },
            },
            {
                "summary": (
                    "basin_print_codes_read validates every print.prt object name and stops with \"... is "
                    "not a valid object\". NAM_Branch reads print.prt by position, so a NAM dataset may name "
                    "basin_sed_bud, which main/dev reject."
                ),
                "file": "basin_print_codes_read.f90",
                "pattern": r"is not a valid object",
                "fixed_pattern": r'case *\( *"basin_sed_bud" *\)',
                "locations": {
                    "main": "basin_print_codes_read.f90:771",
                    "dev": "basin_print_codes_read.f90:763",
                },
            },
        ],
        "remove_when": (
            "water_allocation_read.f90 skips the file when the name is \"null\" (and a subset no longer breaks "
            "the allocation objects), and basin_print_codes_read.f90 accepts basin_sed_bud. Then drop "
            "apply_main_compat, NAM_ONLY_PRINT_OBJECTS and --main-compat."
        ),
    },
    {
        "id": "W4",
        "title": "All outputs off",
        "flag": "--no-outputs",
        "default": "off (opt-in); independent of --main-compat",
        "tool_does": (
            "Sets all four flags (daily, monthly, yearly, average annual) of every remaining print.prt "
            "object row to n, so the subset runs without writing any output table."
        ),
        "bugs": [],
        "remove_when": (
            "Nothing to remove: no SWAT+ defect is registered for this option. It is a user option that takes "
            "the output writers out of a run, for example to tell a model failure from an output failure. If "
            "a defect turns up, register it here with a code pattern so --check-swat-source can track it."
        ),
    },
]

# Defects the tool cannot work around. They are listed so a failing run can be
# recognised, and so --check-swat-source reports whether they are still there.
SWAT_KNOWN_BUGS: list[dict[str, Any]] = [
    {
        "id": "K1",
        "title": "NAM_Branch: 0/0 in the basin sediment budget when a run has no channels",
        "summary": (
            "time_control divides fp_dep_mm and fp_dep_fr_km by sp_ob%chandeg. With no channels (every isolate "
            "subset) that is 0/0, and the run ends with forrtl error 65 after all HRU outputs are written."
        ),
        "bugs": [
            {
                "file": "time_control.f90",
                "pattern": r"fp_dep_mm *= *bsn_sedbud%fp_dep_mm */ *sp_ob%chandeg",
                "locations": {"NAM_Branch": "time_control.f90:460-461"},
            }
        ],
    },
    {
        "id": "K2",
        "title": "Routing-unit element sizing and one routing unit per object",
        "summary": (
            "ru_read_elements sizes ru_def by the largest element id in rout_unit.ele and allocates "
            "ob(iob)%ru(1) once per object. So every kept routing unit needs at least one real element, "
            "there must be at least as many elements as units, and no object may sit in two units. The tool "
            "keeps its subsets inside these limits; empty or zero-fraction placeholder units do not work."
        ),
        "bugs": [
            {
                "file": "ru_read_elements.f90",
                "pattern": r"allocate *\(ru_def\(imax\)\)",
                "locations": {
                    "NAM_Branch": "ru_read_elements.f90:53",
                    "main": "ru_read_elements.f90:55",
                    "dev": "ru_read_elements.f90:55",
                },
            },
            {
                "file": "ru_read_elements.f90",
                "pattern": r"allocate *\(ob\(iob\)%ru\(1\)",
                "locations": {
                    "NAM_Branch": "ru_read_elements.f90:177",
                    "main": "ru_read_elements.f90:179",
                    "dev": "ru_read_elements.f90:179",
                },
            },
        ],
    },
]


def workaround_ids() -> list[str]:
    return [entry["id"] for entry in SWAT_WORKAROUNDS]


def _confirmed_commits(bugs: list[dict[str, Any]]) -> dict[str, str]:
    branches = {branch for bug in bugs for branch in bug.get("locations", {})}
    return {branch: SWAT_BRANCH_COMMITS[branch] for branch in SWAT_BRANCH_COMMITS if branch in branches}


def _grep_command(bug: dict[str, Any]) -> str:
    return f"grep -rniE '{bug['pattern']}' <swatplus checkout>/src"


def render_workarounds_markdown() -> str:
    """Render scripts/SWAT_WORKAROUNDS.md from the registry (the file is generated)."""
    out: list[str] = [
        "# SWAT+ workarounds in the HRU subset tool",
        "",
        "<!-- Generated from SWAT_WORKAROUNDS in hru_processor.py. Edit the registry, then regenerate:",
        "     python -c \"import hru_processor as h; open('SWAT_WORKAROUNDS.md', 'w', newline='\\n').write(h.render_workarounds_markdown())\"",
        "     (run from scripts/). A unit test fails when this file and the registry differ. -->",
        "",
        "`scripts/hru_processor.py` works around defects in SWAT+ so that a subset of a dataset can run. Each",
        "workaround has an id (`W1`..`W4`), is listed in the JSON result as `workarounds_applied`, and is",
        "recorded here with the SWAT+ code it works around, so it can be removed once SWAT+ is fixed.",
        "",
        "Confirmed against these SWAT+ commits: "
        + ", ".join(f"`{branch}` {commit}" for branch, commit in SWAT_BRANCH_COMMITS.items())
        + ".",
        "",
        "To see which workarounds a SWAT+ checkout still needs:",
        "",
        "```bash",
        "python scripts/hru_processor.py --check-swat-source /path/to/swatplus",
        "```",
        "",
        "The command greps each pattern below under `src/` and prints JSON with one status per workaround:",
        "`still_needed` (a defect pattern is present), `no_longer_needed` (every pattern is absent or its fixed",
        "form is present; that also holds for a checkout the defect never existed in, for example W1 and W3 on",
        "`NAM_Branch`) or `unknown` (a source file is missing, or the workaround has no pattern).",
        "",
        "| Id | Workaround | Controlled by | Default |",
        "|---|---|---|---|",
    ]
    for entry in SWAT_WORKAROUNDS:
        out.append(f"| {entry['id']} | {entry['title']} | `{entry['flag']}` | {entry['default']} |")
    out.append("")

    for entry in SWAT_WORKAROUNDS:
        out.append(f"## {entry['id']} - {entry['title']}")
        out.append("")
        out.append(f"- **Flag:** `{entry['flag']}`")
        out.append(f"- **Default:** {entry['default']}")
        out.append(f"- **What the tool does:** {entry['tool_does']}")
        commits = _confirmed_commits(entry["bugs"])
        if commits:
            out.append(
                "- **Confirmed in:** " + ", ".join(f"`{branch}` {commit}" for branch, commit in commits.items())
            )
        out.append(f"- **Remove when:** {entry['remove_when']}")
        if not entry["bugs"]:
            out.append("- **SWAT+ code:** none registered.")
        for bug in entry["bugs"]:
            out.append("")
            out.append(f"**SWAT+ code** - {bug['summary']}")
            out.append("")
            out.append(f"- File: `src/{bug['file']}`")
            out.append(
                "- Where: "
                + ", ".join(f"`{branch}` {where}" for branch, where in bug.get("locations", {}).items())
            )
            out.append(f"- Pattern: `{bug['pattern']}`")
            if bug.get("fixed_pattern"):
                out.append(f"- Fixed when this appears instead: `{bug['fixed_pattern']}`")
            out.append(f"- Find it: `{_grep_command(bug)}`")
        out.append("")

    out.append("## Known SWAT+ bugs with no workaround")
    out.append("")
    out.append(
        "The tool cannot work around these. They are listed so a failing run can be recognised, and "
        "`--check-swat-source` reports whether they are still present."
    )
    out.append("")
    for known in SWAT_KNOWN_BUGS:
        out.append(f"### {known['id']} - {known['title']}")
        out.append("")
        out.append(known["summary"])
        out.append("")
        for bug in known["bugs"]:
            out.append(
                f"- `src/{bug['file']}` ("
                + ", ".join(f"`{branch}` {where}" for branch, where in bug.get("locations", {}).items())
                + f"): pattern `{bug['pattern']}`"
            )
        out.append("")

    out.append("## Retiring a workaround")
    out.append("")
    out.append(
        "1. Run `--check-swat-source` on the SWAT+ version you target; a workaround reported `no_longer_needed`"
    )
    out.append("   can go.")
    out.append("2. Delete its code and its entry in `SWAT_WORKAROUNDS`, and the flag from the CLI and from")
    out.append("   `src/hruProcessor.ts` and the extension options.")
    out.append("3. Update `scripts/test_hru_processor.py`; the registry test lists every id.")
    out.append("")
    return "\n".join(out)


def check_swat_source(swat_path: str | os.PathLike[str]) -> dict[str, Any]:
    """Grep a SWAT+ checkout for the defect patterns in the registry.

    Returns JSON-ready data with one status per workaround: still_needed,
    no_longer_needed or unknown.
    """
    root = Path(swat_path).resolve()
    src = root / "src" if (root / "src").is_dir() else root
    if not src.is_dir():
        raise ValueError(f"No src folder found in {root}.")

    texts: dict[str, list[str] | None] = {}

    def lines_of(filename: str) -> list[str] | None:
        if filename not in texts:
            target = src / filename
            if not target.is_file():
                match = next((p for p in src.iterdir() if p.name.lower() == filename.lower()), None)
                target = match if match is not None else target
            if target.is_file():
                texts[filename] = target.read_text(encoding="latin-1", errors="replace").splitlines()
            else:
                texts[filename] = None
        return texts[filename]

    def hits(filename: str, pattern: str) -> list[int] | None:
        lines = lines_of(filename)
        if lines is None:
            return None
        regex = re.compile(pattern, re.IGNORECASE)
        return [number for number, line in enumerate(lines, start=1) if regex.search(line)]

    def check_bug(bug: dict[str, Any]) -> dict[str, Any]:
        found = hits(bug["file"], bug["pattern"])
        result: dict[str, Any] = {"file": f"src/{bug['file']}", "pattern": bug["pattern"]}
        if found is None:
            result.update(status="unknown", detail=f"src/{bug['file']} not found")
            return result
        fixed = hits(bug["file"], bug["fixed_pattern"]) if bug.get("fixed_pattern") else []
        if fixed:
            result.update(status="fixed", lines=found, fixed_lines=fixed)
        elif found:
            result.update(status="present", lines=found)
        else:
            result.update(status="absent", lines=[])
        return result

    workarounds: list[dict[str, Any]] = []
    for entry in SWAT_WORKAROUNDS:
        checks = [check_bug(bug) for bug in entry["bugs"]]
        statuses = {check["status"] for check in checks}
        if not checks:
            status, detail = "unknown", "no SWAT+ code pattern is registered for this workaround"
        elif "present" in statuses:
            status, detail = "still_needed", "a defect pattern is present in this checkout"
        elif "unknown" in statuses:
            status, detail = "unknown", "a source file for a pattern was not found"
        else:
            status, detail = "no_longer_needed", "no defect pattern is present in this checkout"
        workarounds.append(
            {"id": entry["id"], "title": entry["title"], "flag": entry["flag"],
             "status": status, "detail": detail, "checks": checks}
        )

    known_bugs: list[dict[str, Any]] = []
    for known in SWAT_KNOWN_BUGS:
        checks = [check_bug(bug) for bug in known["bugs"]]
        statuses = {check["status"] for check in checks}
        status = "present" if "present" in statuses else ("unknown" if "unknown" in statuses else "absent")
        known_bugs.append({"id": known["id"], "title": known["title"], "status": status, "checks": checks})

    commit = branch = None
    for key in ("rev-parse --short HEAD", "rev-parse --abbrev-ref HEAD"):
        try:
            completed = subprocess.run(
                ["git", "-C", str(root), *key.split()],
                capture_output=True, text=True, timeout=15, check=False,
            )
            value = completed.stdout.strip() if completed.returncode == 0 else None
        except (OSError, subprocess.SubprocessError):
            value = None
        if key.endswith("HEAD") and "--short" in key:
            commit = value
        else:
            branch = value

    return {
        "ok": True,
        "swat_source": str(root),
        "commit": commit,
        "branch": branch,
        "workarounds": workarounds,
        "known_bugs": known_bugs,
    }


def detect_eol(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def read_text_lines(path: str | os.PathLike[str]) -> tuple[list[str], str]:
    """Read a file as lines without terminators, plus the line ending it uses."""
    with open(path, "r", newline="") as file:
        text = file.read()
    eol = detect_eol(text) if text else "\r\n"
    lines = text.replace("\r\n", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines, eol


def write_text_lines(path: str | os.PathLike[str], lines: list[str], eol: str = "\r\n") -> None:
    with open(path, "w", newline="") as file:
        file.write("".join(line + eol for line in lines))


def format_row(fields: list[str], width: int = 12) -> str:
    return " ".join(str(value).rjust(width) for value in fields)


def replace_token(line: str, index: int, value: str) -> str:
    """Replace the index-th whitespace-separated token, right-aligned in the space it took."""
    spans = [match.span() for match in re.finditer(r"\S+", line)]
    if index >= len(spans):
        return line
    start, end = spans[index]
    return line[:start] + value.rjust(end - start) + line[end:]


def expand_element_tokens(tokens: list[str]) -> list[int]:
    """Expand SWAT+ element lists: a negative number ends a range, so `1 -3` is 1,2,3."""
    values: list[int] = []
    for token in tokens:
        try:
            values.append(int(token))
        except ValueError:
            continue

    expanded: list[int] = []
    index = 0
    while index < len(values):
        if index + 1 < len(values) and values[index + 1] < 0:
            start = values[index]
            end = abs(values[index + 1])
            step = 1 if start <= end else -1
            expanded.extend(range(start, end + step, step))
            index += 2
        else:
            expanded.append(values[index])
            index += 1
    return expanded


def compress_element_ids(ids: list[int]) -> list[str]:
    """Sorted ids -> SWAT+ element tokens; a run of two or more is written `start -end`."""
    tokens: list[str] = []
    index = 0
    while index < len(ids):
        end = index
        while end + 1 < len(ids) and ids[end + 1] == ids[end] + 1:
            end += 1
        tokens.append(str(ids[index]))
        if end > index:
            tokens.append(str(-ids[end]))
        index = end + 1
    return tokens


def renumber_unit_def_file(path: str | os.PathLike[str], elem_map: dict[int, int]) -> dict[int, int]:
    """Rewrite a `title / count / header / id name area elem_tot elems...` definition file.

    Elements are mapped through elem_map, definitions left with no element are
    dropped and the rest are numbered again. Returns old definition id -> new id.
    """
    if not os.path.isfile(path):
        return {}
    lines, eol = read_text_lines(path)
    if len(lines) < 3:
        return {}

    def_map: dict[int, int] = {}
    renumbered: list[list[str]] = []
    for line in lines[3:]:
        fields = line.split()
        if len(fields) < 4:
            continue
        try:
            old_def_id = int(fields[0])
            elem_tot = int(fields[3])
        except ValueError:
            continue
        old_elements = expand_element_tokens(fields[4 : 4 + elem_tot])
        new_elements = [str(elem_map[elem]) for elem in old_elements if elem in elem_map]
        if not new_elements:
            continue
        new_def_id = len(renumbered) + 1
        def_map[old_def_id] = new_def_id
        fields[0] = str(new_def_id)
        fields[3] = str(len(new_elements))
        renumbered.append(fields[:4] + new_elements)

    out = [lines[0], str(len(renumbered)), lines[2]] + [format_row(row) for row in renumbered]
    write_text_lines(path, out, eol)
    return def_map


def renumber_unit_element_file(
    path: str | os.PathLike[str],
    id_maps: dict[str, dict[int, int]],
) -> dict[int, int]:
    """Rewrite a `title / header / id name obj_typ obj_typ_no ...` element file.

    Keeps the rows whose object is retained (object numbers go through id_maps,
    channel rows may say `cha`, `sdc` or `chandeg`), numbers the rows again from 1
    and returns old element id -> new element id.
    """
    if not os.path.isfile(path):
        return {}
    lines, eol = read_text_lines(path)
    if len(lines) < 2:
        return {}

    aliases = {"chandeg": "sdc", "hru_lte": "hlt"}
    elem_map: dict[int, int] = {}
    rows: list[list[str]] = []
    for line in lines[2:]:
        fields = line.split()
        if len(fields) < 4:
            continue
        try:
            old_elem_id = int(fields[0])
            old_obj_no = int(fields[3])
        except ValueError:
            continue
        obj_typ = aliases.get(fields[2].lower(), fields[2].lower())
        type_map = id_maps.get(obj_typ, {})
        if old_obj_no not in type_map:
            continue
        new_elem_id = len(rows) + 1
        elem_map[old_elem_id] = new_elem_id
        fields[0] = str(new_elem_id)
        fields[3] = str(type_map[old_obj_no])
        rows.append(fields)

    write_text_lines(path, lines[:2] + [format_row(row) for row in rows], eol)
    return elem_map


def has_data_rows(path: str | os.PathLike[str], header_lines: int) -> bool:
    if not os.path.isfile(path):
        return False
    lines, _ = read_text_lines(path)
    return any(line.strip() for line in lines[header_lines:])


def sanitize_region_files(directory: str | os.PathLike[str], id_maps: dict[str, dict[int, int]]) -> list[str]:
    """Renumber the REGIONS files that carry object numbers; return the ones to null in file.cio."""
    directory = os.fspath(directory)
    to_null: list[str] = []
    for ele_name, def_name in REGION_UNIT_FILES:
        ele_path = os.path.join(directory, ele_name)
        def_path = os.path.join(directory, def_name)
        if not has_data_rows(ele_path, 2):
            continue
        elem_map = renumber_unit_element_file(ele_path, id_maps)
        if has_data_rows(def_path, 3):
            renumber_unit_def_file(def_path, elem_map)
        print(f"  {ele_name}: kept {len(elem_map)} element(s)")
    for name in REGION_NULLABLE_FILES:
        if has_data_rows(os.path.join(directory, name), 2):
            to_null.append(name)
    return to_null


def renumber_chan_surf_lin(path: str | os.PathLike[str], id_maps: dict[str, dict[int, int]]) -> int:
    """Renumber chan-surf.lin (`id name nspu (obj_typ obj_typ_no)...`) for the retained channels."""
    if not os.path.isfile(path):
        return 0
    lines, eol = read_text_lines(path)
    if len(lines) < 3 or not any(line.strip() for line in lines[3:]):
        return 0

    sdc_map = id_maps.get("sdc", {})
    rows: list[str] = []
    for line in lines[3:]:
        fields = line.split()
        if len(fields) < 3:
            continue
        try:
            old_id = int(fields[0])
            nspu = int(fields[2])
        except ValueError:
            continue
        if old_id not in sdc_map:
            continue
        pairs: list[tuple[str, str]] = []
        for index in range(nspu):
            base = 3 + index * 2
            if base + 1 >= len(fields):
                break
            obj_typ, obj_no = fields[base], fields[base + 1]
            try:
                new_no = id_maps.get(obj_typ.lower(), {}).get(int(obj_no))
            except ValueError:
                new_no = None
            if new_no is not None:
                pairs.append((obj_typ, str(new_no)))
        if not pairs:
            continue
        flat = [value for pair in pairs for value in pair]
        rows.append(format_row([str(sdc_map[old_id]), fields[1], str(len(pairs))] + flat))

    write_text_lines(path, [lines[0], str(len(rows)), lines[2]] + rows, eol)
    return len(rows)


def column_index(header: list[str], names: set[str], default: int) -> int:
    lowered = {name.lower() for name in names}
    return next((index for index, column in enumerate(header) if column.lower() in lowered), default)


def compact_hydrology_wet(directory: str | os.PathLike[str]) -> dict[str, int]:
    """W2: keep only the hydrology.wet rows the kept HRUs' wetlands refer to, in their original order.

    Chain: hru-data.hru SURF_STOR -> wetland.wet NAME, whose HYD names a hydrology.wet row.
    Returns {"kept": n, "removed": n}; removed is 0 when the file was left alone.
    """
    directory = os.fspath(directory)
    hru_path = os.path.join(directory, "hru-data.hru")
    wet_path = os.path.join(directory, "wetland.wet")
    hyd_path = os.path.join(directory, "hydrology.wet")
    result = {"kept": 0, "removed": 0}
    if not all(os.path.isfile(path) for path in (hru_path, wet_path, hyd_path)):
        return result

    hru_lines, _ = read_text_lines(hru_path)
    wet_lines, _ = read_text_lines(wet_path)
    hyd_lines, hyd_eol = read_text_lines(hyd_path)
    if len(hru_lines) < 3 or len(wet_lines) < 3 or len(hyd_lines) < 3:
        return result

    stor_col = column_index(hru_lines[1].split(), {"surf_stor"}, 7)
    stores: set[str] = set()
    for line in hru_lines[2:]:
        fields = line.split()
        if len(fields) > stor_col and fields[stor_col].lower() != "null":
            stores.add(fields[stor_col])

    wet_header = wet_lines[1].split()
    name_col = column_index(wet_header, {"name"}, 1)
    hyd_col = column_index(wet_header, {"hyd"}, 3)
    needed: set[str] = set()
    for line in wet_lines[2:]:
        fields = line.split()
        if len(fields) > max(name_col, hyd_col) and fields[name_col] in stores:
            needed.add(fields[hyd_col])

    rows = [line for line in hyd_lines[2:] if line.strip()]
    kept = [line for line in rows if line.split()[0] in needed]
    result["kept"] = len(kept)
    if not kept or len(kept) == len(rows):
        # Nothing refers to the file (no kept wetland), or nothing to drop.
        return result

    write_text_lines(hyd_path, hyd_lines[:2] + kept, hyd_eol)
    result["removed"] = len(rows) - len(kept)
    print(f"hydrology.wet compacted: kept {len(kept)} of {len(rows)} row(s).")
    return result


def edit_print_prt(
    directory: str | os.PathLike[str],
    remove_names: set[str] | None = None,
    silence: bool = False,
) -> dict[str, int]:
    """Edit the object rows of print.prt (the rows after the `OBJECTS ...` header line).

    remove_names drops rows by object name (case-insensitive); silence sets all four
    flags of every remaining row to n.
    """
    path = os.path.join(os.fspath(directory), "print.prt")
    result = {"removed": 0, "silenced": 0}
    if not os.path.isfile(path):
        return result
    lines, eol = read_text_lines(path)
    removed = {name.lower() for name in remove_names or set()}
    in_objects = False
    new_lines: list[str] = []
    for line in lines:
        fields = line.split()
        if not in_objects:
            new_lines.append(line)
            if fields and fields[0].upper() == "OBJECTS":
                in_objects = True
            continue
        if len(fields) < 5:
            new_lines.append(line)
            continue
        if fields[0].lower() in removed:
            result["removed"] += 1
            continue
        if silence:
            # Keep the column layout: overwrite each of the four flag tokens in place.
            for flag_index in range(1, 5):
                line = replace_token(line, flag_index, "n")
            result["silenced"] += 1
        new_lines.append(line)
    write_text_lines(path, new_lines, eol)
    return result


def apply_main_compat(directory: str | os.PathLike[str]) -> dict[str, Any]:
    """W3: switch water allocation off and drop the print.prt rows main/dev reject."""
    directory = os.fspath(directory)
    changes: dict[str, Any] = {"water_rights": False, "null_file_created": False, "print_rows_removed": 0}

    cio_path = os.path.join(directory, "file.cio")
    if os.path.isfile(cio_path):
        lines, eol = read_text_lines(cio_path)
        for index, line in enumerate(lines):
            fields = line.split()
            if fields and fields[0].upper() == "WATER_RIGHTS":
                lines[index] = "WATER_RIGHTS".rjust(21) + "".join("null".rjust(21) for _ in range(3))
                changes["water_rights"] = True
        write_text_lines(cio_path, lines, eol)

    # water_allocation_read skips a name of "null" only when a file called null exists.
    null_path = os.path.join(directory, "null")
    if not os.path.exists(null_path):
        with open(null_path, "w"):
            pass
        changes["null_file_created"] = True

    changes["print_rows_removed"] = edit_print_prt(directory, remove_names=NAM_ONLY_PRINT_OBJECTS)["removed"]
    print(
        "main-compat: WATER_RIGHTS -> null null null"
        f", removed {changes['print_rows_removed']} NAM-only print.prt row(s)."
    )
    return changes


def parse_filter_ids(filter_input: str) -> list[int]:
    ids: set[int] = set()
    if not filter_input or not filter_input.strip():
        raise ValueError("Please provide at least one HRU ID.")

    for part in filter_input.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                start_text, end_text = part.split("-", 1)
                start = int(start_text.strip())
                end = int(end_text.strip())
            except ValueError as exc:
                raise ValueError(f"Invalid range format: '{part}'") from exc
            if start > end:
                raise ValueError(f"Invalid range '{part}': start should be <= end.")
            ids.update(range(start, end + 1))
        else:
            try:
                ids.add(int(part))
            except ValueError as exc:
                raise ValueError(f"Invalid ID format: '{part}'") from exc

    if not ids:
        raise ValueError("Please provide at least one HRU ID.")
    if any(value <= 0 for value in ids):
        raise ValueError("HRU IDs must be positive integers.")
    return sorted(ids)


def resolve_txtinout_dir(dataset_path: str | os.PathLike[str]) -> Path:
    dataset = Path(dataset_path).resolve()
    if (dataset / "file.cio").is_file():
        return dataset
    txtinout = dataset / "TxtInOut"
    if (txtinout / "file.cio").is_file():
        return txtinout
    raise ValueError(f"No file.cio found in {dataset}. Select a SWAT+ TxtInOut folder.")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def count_column_index(headers: list[str], key: str) -> int | None:
    aliases = {normalize(alias) for alias in COUNT_COLUMN_ALIASES[key]}
    for index, header in enumerate(headers):
        if normalize(header) in aliases:
            return index
    return None


def canonical_counts(counts: dict[str, int]) -> dict[str, int]:
    canonical: dict[str, int] = {}
    for key, value in counts.items():
        count_key = OBJECT_TYPE_TO_COUNT_KEY.get(key, key)
        if count_key not in COUNT_COLUMN_ALIASES:
            continue
        canonical[count_key] = canonical.get(count_key, 0) + int(value)
    return canonical


def format_count_fields(headers: list[str], fields: list[str]) -> str:
    width_count = max(len(headers), len(fields))
    widths = []
    for index in range(width_count):
        header = headers[index] if index < len(headers) else ""
        field = fields[index] if index < len(fields) else ""
        widths.append(max(len(header), len(field)))
    return " ".join(fields[index].rjust(widths[index]) for index in range(len(fields))) + "\n"


def update_object_count_file(path: str | os.PathLike[str], counts: dict[str, int]) -> None:
    path = Path(path)
    with path.open("r") as file:
        lines = file.readlines()
    if len(lines) < 3:
        raise ValueError(f"{path.name} must contain a title, header, and data row.")

    title = lines[0]
    header_line = lines[1]
    headers = header_line.split()
    obj_index = count_column_index(headers, "obj")
    if obj_index is None:
        raise ValueError("object.cnt does not contain an object total column.")

    counts_by_key = canonical_counts(counts)
    total = sum(counts_by_key.get(key, 0) for key in COUNT_KEYS)
    new_lines = [title, header_line]

    for line in lines[2:]:
        fields = line.split()
        if not fields:
            new_lines.append(line)
            continue
        if obj_index >= len(fields):
            raise ValueError("object.cnt data row has fewer columns than its header.")

        for key in COUNT_KEYS:
            index = count_column_index(headers, key)
            if index is not None and index < len(fields):
                fields[index] = "0"

        fields[obj_index] = str(total)
        for key, value in counts_by_key.items():
            if key == "obj":
                continue
            index = count_column_index(headers, key)
            if index is None:
                if value:
                    raise ValueError(f"object.cnt is missing a column for {key}.")
                continue
            if index >= len(fields):
                raise ValueError("object.cnt data row has fewer columns than its header.")
            fields[index] = str(value)
        new_lines.append(format_count_fields(headers, fields))

    with path.open("w") as file:
        file.writelines(new_lines)


def make_unique_destination(path: Path) -> Path:
    if not path.exists():
        return path
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = path.with_name(f"{path.name}_{timestamp}")
    if not candidate.exists():
        return candidate
    suffix = 2
    while True:
        candidate = path.with_name(f"{path.name}_{timestamp}_{suffix}")
        if not candidate.exists():
            return candidate
        suffix += 1


def copy_swat(
    src_dir: str | os.PathLike[str],
    dest_dir: str | os.PathLike[str],
    overwrite: bool = False,
    exclude_suffixes: list[str] | None = None,
) -> Path:
    src = Path(src_dir).resolve()
    dest = Path(dest_dir).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Source directory {src} does not exist.")

    if dest.exists():
        if overwrite:
            shutil.rmtree(dest)
        else:
            dest = make_unique_destination(dest)

    if exclude_suffixes is None:
        exclude_suffixes = [
            "*.txt",
            "*.csv",
            "*.out",
            "*.fin",
            "*.sqlite",
            "*.db",
            "*.log",
            "*.pid",
            "fort.*",
        ]

    dest.mkdir(parents=True, exist_ok=True)
    for entry in src.iterdir():
        if not entry.is_file():
            continue
        lower_name = entry.name.lower()
        if any(fnmatch.fnmatch(lower_name, pattern.lower()) for pattern in exclude_suffixes):
            continue
        shutil.copy2(entry, dest / entry.name)

    print(f"Working copy created: {dest}")
    return dest


class FileModifier:
    def __init__(self, txtinout_dir: str | os.PathLike[str]):
        self.txtinout_dir = os.fspath(txtinout_dir)
        self.hru_id_map: dict[int, int] = {}
        self.hru_props_map: dict[int, int] = {}
        self.lsu_id_map: dict[int, int] = {}

    def _file_path(self, filename: str) -> str:
        direct = os.path.join(self.txtinout_dir, filename)
        if os.path.isfile(direct):
            return direct
        target = filename.lower()
        for existing in os.listdir(self.txtinout_dir):
            if existing.lower() == target:
                return os.path.join(self.txtinout_dir, existing)
        return direct

    def _read_hru_rows(self) -> tuple[list[str], list[dict[str, str]]]:
        path = self._file_path("hru.con")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            raise ValueError("hru.con must contain a title and column header.")

        headers = lines[1].split()
        rows: list[dict[str, str]] = []
        for line in lines[2:]:
            fields = line.split()
            if fields:
                rows.append(dict(zip(headers, fields)))
        return headers, rows

    def _expand_element_tokens(self, tokens: list[str]) -> list[int]:
        return expand_element_tokens(tokens)

    def _format_row(self, fields: list[str], width: int = 12) -> str:
        return format_row(fields, width) + "\n"

    def _header_index(self, headers: list[str], names: set[str], default: int | None = None) -> int | None:
        lowered = {name.lower() for name in names}
        return next((index for index, header in enumerate(headers) if header.lower() in lowered), default)

    def get_hru_range(self) -> tuple[int, int, int]:
        headers, rows = self._read_hru_rows()
        id_column = next((column for column in headers if column.lower() == "id"), None)
        if id_column is None:
            raise ValueError("No 'ID' column found in hru.con file.")

        hru_ids = []
        for row in rows:
            try:
                hru_ids.append(int(row[id_column]))
            except (KeyError, ValueError):
                continue
        if not hru_ids:
            raise ValueError("No HRU IDs found in hru.con file.")
        return min(hru_ids), max(hru_ids), len(hru_ids)

    def get_hru_line(self, filter_id: int) -> dict[str, str] | None:
        headers, rows = self._read_hru_rows()
        id_column = next((column for column in headers if column.lower() == "id"), None)
        if id_column is None:
            raise ValueError("No 'ID' column found in hru.con file.")
        for row in rows:
            try:
                if int(row[id_column]) == int(filter_id):
                    return row
            except (KeyError, ValueError):
                continue
        return None

    def modify_hru_con(self, filter_ids: list[int]) -> list[int]:
        path = self._file_path("hru.con")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            raise ValueError("hru.con must contain a title and column header.")

        title = lines[0]
        column_header = lines[1]
        column_names = column_header.split()
        id_idx = next((i for i, col in enumerate(column_names) if col.lower() == "id"), None)
        out_idx = next(
            (
                i
                for i, col in enumerate(column_names)
                if col.lower() in {"out_tot", "src_tot"}
            ),
            None,
        )
        props_idx = 7 if len(column_names) > 7 else None
        if id_idx is None:
            raise ValueError("No 'id' column found in hru.con.")
        if out_idx is None:
            raise ValueError("No 'out_tot' or 'src_tot' column found in hru.con.")

        filter_set = {int(filter_id) for filter_id in filter_ids}
        selected: list[list[str]] = []
        found_ids: set[int] = set()
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                hru_id = int(fields[id_idx])
            except (IndexError, ValueError):
                continue
            if hru_id in filter_set:
                selected.append(fields)
                found_ids.add(hru_id)

        missing_ids = sorted(filter_set - found_ids)
        if missing_ids:
            raise ValueError(f"HRU ID(s) not found in hru.con: {missing_ids}")

        original_props: list[int] = []
        if props_idx is not None:
            for fields in selected:
                if props_idx < len(fields):
                    try:
                        original_props.append(int(fields[props_idx]))
                    except ValueError:
                        pass
        unique_props = sorted(set(original_props))
        props_map = {old: new for new, old in enumerate(unique_props, start=1)}
        self.hru_props_map = props_map

        base_col_count = out_idx + 1
        base_col_names = column_names[:base_col_count]
        renumbered: list[list[str]] = []
        self.hru_id_map = {}
        for new_id, fields in enumerate(selected, start=1):
            old_id = int(fields[id_idx])
            self.hru_id_map[old_id] = new_id
            row = fields[:base_col_count]
            row[id_idx] = str(new_id)
            if props_idx is not None and props_idx < len(row):
                try:
                    row[props_idx] = str(props_map[int(row[props_idx])])
                except (KeyError, ValueError):
                    pass
            row[out_idx] = "0"
            renumbered.append(row)

        column_widths = []
        for index, column in enumerate(base_col_names):
            max_data = max(len(row[index]) for row in renumbered)
            column_widths.append(max(len(column), max_data))

        with open(path, "w") as file:
            file.write(title)
            file.write(
                " ".join(column.rjust(width) for column, width in zip(base_col_names, column_widths))
                + "\n"
            )
            for row in renumbered:
                file.write(
                    " ".join(value.rjust(width) for value, width in zip(row, column_widths))
                    + "\n"
                )

        print(f"hru.con updated: kept {len(renumbered)} HRU(s).")
        return unique_props

    def modify_object_cnt(self, hru_count: int) -> None:
        update_object_count_file(self._file_path("object.cnt"), {"hru": hru_count})
        print("object.cnt updated successfully.")

    def modify_file_cio(
        self,
        parameters_to_nullify: set[str] | None = None,
        extra_nullify: set[str] | None = None,
    ) -> None:
        if parameters_to_nullify is None:
            parameters_to_nullify = {
                "rout_unit.dr",
                "water_allocation.wro",
                "element.wro",
                "water_rights.wro",
                "object.prt",
                "rout_unit.con",
                "aquifer.con",
                "aquifer2d.con",
                "channel.con",
                "reservoir.con",
                "recall.con",
                "exco.con",
                "delratio.con",
                "outlet.con",
                "chandeg.con",
                "gwflow.con",
                "hru-lte.con",
            }
        parameters_to_nullify = set(parameters_to_nullify) | set(extra_nullify or ())
        path = self._file_path("file.cio")
        with open(path, "r") as file:
            content = file.read()
        for filename in sorted(parameters_to_nullify):
            pattern = re.compile(rf"\b{re.escape(filename)}\b", re.IGNORECASE)
            if pattern.search(content):
                content = pattern.sub("null", content)
                print(f"  {filename} -> null")
        with open(path, "w") as file:
            file.write(content)
        print("file.cio updated successfully.")

    def disable_print_objects(self, object_names: set[str]) -> None:
        path = self._file_path("print.prt")
        if not os.path.isfile(path):
            return
        disabled = {name.lower() for name in object_names}
        changed = 0
        new_lines: list[str] = []
        with open(path, "r") as file:
            for line in file:
                fields = line.split()
                if len(fields) >= 5 and fields[0].lower() in disabled:
                    fields[1:5] = ["n", "n", "n", "n"]
                    line = " ".join(fields) + "\n"
                    changed += 1
                new_lines.append(line)
        if changed:
            with open(path, "w") as file:
                file.writelines(new_lines)
            print(f"print.prt updated: disabled {changed} routing-unit output row(s).")

    def modify_secondary_references(self, hru_id_map: dict[int, int] | None = None) -> dict[str, dict[int, int]]:
        hru_id_map = hru_id_map or self.hru_id_map
        if not hru_id_map:
            raise ValueError("HRU ID map is empty. Run modify_hru_con first.")
        lsu_elem_map = self.modify_ls_unit_ele(hru_id_map)
        self.lsu_id_map = self.modify_ls_unit_def(lsu_elem_map)
        ru_elem_map = self.modify_rout_unit_ele(hru_id_map)
        ru_id_map = self.modify_rout_unit_def(ru_elem_map)
        self.modify_rout_unit_rtu(ru_id_map)
        return {
            "ls_unit_elements": lsu_elem_map,
            "rout_unit_elements": ru_elem_map,
            "rout_units": ru_id_map,
        }

    def modify_region_files(self, hru_id_map: dict[int, int] | None = None) -> list[str]:
        """Renumber the REGIONS and LINK files that carry object numbers.

        An isolated subset keeps no channels, aquifers or reservoirs, so only HRU
        rows survive in them. Returns the files to null in file.cio.
        """
        id_maps = {"hru": hru_id_map or self.hru_id_map, "lsu": self.lsu_id_map}
        to_null = sanitize_region_files(self.txtinout_dir, id_maps)
        renumber_chan_surf_lin(self._file_path("chan-surf.lin"), id_maps)
        return to_null

    def modify_ls_unit_ele(self, hru_id_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("ls_unit.ele")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        headers = column_header.split()
        id_idx = self._header_index(headers, {"id"}, 0)
        typ_idx = self._header_index(headers, {"obj_typ", "objtyp"}, 2)
        obj_idx = self._header_index(headers, {"obj_typ_no", "objtypno", "obj_id"}, 3)
        if id_idx is None or typ_idx is None or obj_idx is None:
            return {}

        selected: list[tuple[int, int, list[str]]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) <= max(id_idx, typ_idx, obj_idx):
                continue
            try:
                old_elem_id = int(fields[id_idx])
                old_hru_id = int(fields[obj_idx])
            except ValueError:
                continue
            if fields[typ_idx].lower() == "hru" and old_hru_id in hru_id_map:
                selected.append((hru_id_map[old_hru_id], old_elem_id, fields))

        selected.sort(key=lambda item: item[0])
        elem_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for new_hru_id, old_elem_id, fields in selected:
            elem_map[old_elem_id] = new_hru_id
            fields[id_idx] = str(new_hru_id)
            fields[obj_idx] = str(new_hru_id)
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"ls_unit.ele updated: kept {len(renumbered)} element(s).")
        return elem_map

    def modify_ls_unit_def(self, elem_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("ls_unit.def")
        def_map = renumber_unit_def_file(path, elem_map)
        if os.path.isfile(path):
            print(f"ls_unit.def updated: kept {len(def_map)} definition(s).")
        return def_map

    def modify_rout_unit_ele(self, hru_id_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("rout_unit.ele")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        headers = column_header.split()
        id_idx = self._header_index(headers, {"id"}, 0)
        typ_idx = self._header_index(headers, {"obj_typ", "objtyp"}, 2)
        obj_idx = self._header_index(headers, {"obj_id", "obj_typ_no", "objtypno"}, 3)
        if id_idx is None or typ_idx is None or obj_idx is None:
            return {}

        selected: list[tuple[int, int, list[str]]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) <= max(id_idx, typ_idx, obj_idx):
                continue
            try:
                old_elem_id = int(fields[id_idx])
                old_hru_id = int(fields[obj_idx])
            except ValueError:
                continue
            if fields[typ_idx].lower() == "hru" and old_hru_id in hru_id_map:
                selected.append((hru_id_map[old_hru_id], old_elem_id, fields))

        selected.sort(key=lambda item: item[0])
        elem_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for new_elem_id, (new_hru_id, old_elem_id, fields) in enumerate(selected, start=1):
            elem_map[old_elem_id] = new_elem_id
            fields[id_idx] = str(new_elem_id)
            fields[obj_idx] = str(new_hru_id)
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.ele updated: kept {len(renumbered)} element(s).")
        return elem_map

    def modify_rout_unit_def(self, elem_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("rout_unit.def")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        ru_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) < 3:
                continue
            try:
                old_ru_id = int(fields[0])
                elem_tot = int(fields[2])
            except ValueError:
                continue
            old_elements = self._expand_element_tokens(fields[3 : 3 + elem_tot])
            new_elements = [str(elem_map[elem]) for elem in old_elements if elem in elem_map]
            if not new_elements:
                continue
            new_ru_id = len(renumbered) + 1
            ru_map[old_ru_id] = new_ru_id
            fields[0] = str(new_ru_id)
            fields[2] = str(len(new_elements))
            renumbered.append(fields[:3] + new_elements)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.def updated: kept {len(renumbered)} definition(s).")
        return ru_map

    def modify_rout_unit_rtu(self, ru_id_map: dict[int, int]) -> None:
        path = self._file_path("rout_unit.rtu")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return

        title = lines[0]
        column_header = lines[1]
        def_idx = column_index(column_header.split(), {"def"}, 2)
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                old_ru_id = int(fields[0])
            except ValueError:
                continue
            if old_ru_id not in ru_id_map:
                continue
            fields[0] = str(ru_id_map[old_ru_id])
            # DEF names a rout_unit.def row, and those were renumbered too.
            if def_idx < len(fields):
                try:
                    fields[def_idx] = str(ru_id_map.get(int(fields[def_idx]), int(fields[def_idx])))
                except ValueError:
                    pass
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.rtu updated: kept {len(renumbered)} row(s).")

    def modify_hru_data(self, filter_ids: list[int]) -> None:
        path = self._file_path("hru-data.hru")
        if not os.path.isfile(path):
            raise FileNotFoundError("hru-data.hru not found.")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            raise ValueError("hru-data.hru must contain a title, header, and data row.")

        title = lines[0]
        column_header = lines[1]
        filter_set = {int(filter_id) for filter_id in filter_ids}
        selected: list[str] = []
        found_ids: set[int] = set()
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                data_id = int(fields[0])
            except ValueError:
                continue
            if data_id in filter_set:
                selected.append(line)
                found_ids.add(data_id)

        missing_ids = sorted(filter_set - found_ids)
        if missing_ids:
            raise ValueError(f"ID(s) not found in hru-data.hru: {missing_ids}")

        renumbered: list[str] = []
        for new_id, line in enumerate(selected, start=1):
            fields = line.split(maxsplit=1)
            if len(fields) > 1:
                renumbered.append(f"{new_id:>8} {fields[1]}\n")
            else:
                renumbered.append(f"{new_id:>8}\n")

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            file.writelines(renumbered)
        print(f"hru-data.hru updated: kept {len(renumbered)} row(s).")


class RoutingTracer:
    def __init__(self, txtinout_dir: str | os.PathLike[str], add_feeder_hrus: bool = True):
        self.dir = os.fspath(txtinout_dir)
        self.add_feeder_hrus = add_feeder_hrus
        self.added_hrus: list[dict[str, Any]] = []
        self._elem_id_map: dict[int, int] = {}
        self._graph: dict[tuple[str, int], list[tuple[str, int, str, float]]] = {}
        self._names: dict[tuple[str, int], str] = {}
        self._ru_elements: dict[int, list[int]] = {}
        self._element_objects: dict[int, tuple[str, int]] = {}

    def trace_and_filter(self, selected_hru_ids: list[int]) -> tuple[dict[str, set[int]], dict[str, dict[int, int]]]:
        selected = sorted({int(hru_id) for hru_id in selected_hru_ids})
        self._load_graph()
        missing = [hru_id for hru_id in selected if ("hru", hru_id) not in self._graph]
        if missing:
            raise ValueError(f"HRU ID(s) not found in hru.con: {missing}")

        ru_ids = self._find_routing_units_for_hrus(selected)
        print(f"Routing units containing selected HRUs: {sorted(ru_ids)}")

        keep = self._compute_keep(selected)
        if self.add_feeder_hrus:
            keep = self._add_feeder_hrus(selected, keep)

        print("Objects to keep:")
        for typ in sorted(keep):
            print(f"  {typ}: {sorted(keep[typ])}")

        id_maps = {
            typ: {old: new for new, old in enumerate(sorted(ids), start=1)}
            for typ, ids in keep.items()
        }
        self._write_subset(keep, id_maps)
        return keep, id_maps

    def _write_subset(self, keep: dict[str, set[int]], id_maps: dict[str, dict[int, int]]) -> None:
        lsu_id_map: dict[int, int] = {}
        for typ, (con_file, data_file) in OBJ_TYPE_FILES.items():
            if typ not in keep:
                continue
            con_path = os.path.join(self.dir, con_file)
            original_props: set[int] = set()
            if os.path.isfile(con_path):
                original_props = self._filter_con_file(con_path, keep[typ], id_maps[typ], id_maps)
            if data_file:
                data_path = os.path.join(self.dir, data_file)
                if os.path.isfile(data_path):
                    filter_ids_for_data = original_props if original_props else keep[typ]
                    data_map = {old: new for new, old in enumerate(sorted(filter_ids_for_data), start=1)}
                    self._filter_data_file(data_path, filter_ids_for_data, data_map)

        if "ru" in keep:
            self._filter_rout_unit_ele(keep, id_maps)
            self._filter_rout_unit_def(keep["ru"], id_maps)
            self._renumber_rout_unit_rtu_def(id_maps["ru"])

        if "hru" in id_maps:
            modifier = FileModifier(self.dir)
            lsu_elem_map = modifier.modify_ls_unit_ele(id_maps["hru"])
            lsu_id_map = modifier.modify_ls_unit_def(lsu_elem_map)

        self._filter_aqu_cha_lin(id_maps)
        links = renumber_chan_surf_lin(os.path.join(self.dir, "chan-surf.lin"), id_maps)
        if links:
            print(f"  chan-surf.lin: kept {links} channel link(s)")
        extra_null = sanitize_region_files(self.dir, {**id_maps, "lsu": lsu_id_map})

        update_object_count_file(
            os.path.join(self.dir, "object.cnt"),
            {typ: len(ids) for typ, ids in keep.items()},
        )
        print("  object.cnt updated")
        self._update_file_cio(keep, extra_null)

    def _load_graph(self) -> None:
        """Read every .con file, plus the routing-unit membership edges, from the full dataset."""
        self._graph = {}
        self._names = {}
        for typ, (con_file, _) in OBJ_TYPE_FILES.items():
            path = os.path.join(self.dir, con_file)
            if not os.path.isfile(path):
                continue
            rows = self._parse_con_file(path)
            for obj_id, fields in rows.items():
                self._graph[(typ, obj_id)] = self._extract_routing_targets(fields)
                if len(fields) > 1:
                    self._names[(typ, obj_id)] = fields[1]

        # An element of a routing unit reaches the channels through that unit. In this kind of
        # dataset the upland unit routes only to its pond and aquifer and is listed as an element
        # (OBJ_TYP ru) of the unit that routes to the channels.
        self._ru_elements, self._element_objects = self._read_ru_structure()
        for ru_id, element_ids in self._ru_elements.items():
            for element_id in element_ids:
                obj = self._element_objects.get(element_id)
                if obj is None or obj[0] not in {"hru", "ru"} or obj == ("ru", ru_id):
                    continue
                self._graph.setdefault(obj, []).append(("ru", ru_id, MEMBERSHIP_EDGE, 1.0))

    def _read_ru_structure(self) -> tuple[dict[int, list[int]], dict[int, tuple[str, int]]]:
        """rout_unit.def -> unit id: element ids; rout_unit.ele -> element id: (object type, object id)."""
        ru_elements: dict[int, list[int]] = {}
        element_objects: dict[int, tuple[str, int]] = {}
        ele_path = os.path.join(self.dir, "rout_unit.ele")
        if os.path.isfile(ele_path):
            lines, _ = read_text_lines(ele_path)
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 4:
                    continue
                try:
                    element_objects[int(fields[0])] = (fields[2].lower(), int(fields[3]))
                except ValueError:
                    continue
        def_path = os.path.join(self.dir, "rout_unit.def")
        if os.path.isfile(def_path):
            lines, _ = read_text_lines(def_path)
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 3:
                    continue
                try:
                    ru_id = int(fields[0])
                    num_elem = int(fields[2])
                except ValueError:
                    continue
                ru_elements[ru_id] = self._expand_element_tokens(fields[3 : 3 + num_elem])
        return ru_elements, element_objects

    def _trace(self, selected: list[int], excluded_rus: set[int]) -> dict[str, set[int]]:
        keep: dict[str, set[int]] = {"hru": set(selected)}
        queue: deque[tuple[str, int]] = deque(("hru", hru_id) for hru_id in selected)
        visited = set(queue)
        while queue:
            node = queue.popleft()
            for target_typ, target_id, _, _ in self._graph.get(node, []):
                key = (target_typ, target_id)
                if key in visited or (target_typ == "ru" and target_id in excluded_rus):
                    continue
                visited.add(key)
                keep.setdefault(target_typ, set()).add(target_id)
                queue.append(key)
        return keep

    def _ru_has_kept_element(self, ru_id: int, keep: dict[str, set[int]]) -> bool:
        for element_id in self._ru_elements.get(ru_id, []):
            obj_typ, obj_id = self._element_objects.get(element_id, ("", 0))
            if obj_id in keep.get(obj_typ, set()):
                return True
        return False

    def _compute_keep(self, selected: list[int]) -> dict[str, set[int]]:
        """Trace downstream from the selected HRUs.

        A routing unit that ends up with none of its elements kept has nothing to route and
        SWAT+ cannot size it (ru_read_elements), so it is left out and the trace runs again.
        """
        excluded: set[int] = set()
        while True:
            keep = self._trace(selected, excluded)
            empty = {ru_id for ru_id in keep.get("ru", set()) if not self._ru_has_kept_element(ru_id, keep)}
            if not empty:
                return keep
            print(f"Routing units with no kept element are left out: {sorted(empty)}")
            excluded |= empty

    def _channel_only_channels(self, keep: dict[str, set[int]]) -> list[int]:
        """Kept channels whose inflows (from the kept objects) are only other channels."""
        inflow_types: dict[int, set[str]] = {}
        kept_channels = keep.get("sdc", set())
        for typ, ids in keep.items():
            for obj_id in ids:
                for target_typ, target_id, hyd_typ, _ in self._graph.get((typ, obj_id), []):
                    if target_typ == "sdc" and hyd_typ != MEMBERSHIP_EDGE and target_id in kept_channels:
                        inflow_types.setdefault(target_id, set()).add(typ)
        return sorted(chan for chan, types in inflow_types.items() if types == {"sdc"})

    def _feeders_of_channel(self, channel_id: int) -> list[tuple[str, int]]:
        """Routing units, then HRUs, of the full dataset that route to a channel."""
        sources = [
            node
            for node, targets in self._graph.items()
            if node[0] in {"ru", "hru"}
            and any(t == "sdc" and i == channel_id and hyd != MEMBERSHIP_EDGE for t, i, hyd, _ in targets)
        ]
        return sorted(sources, key=lambda node: (node[0] != "ru", node[1]))

    def _hru_of_routing_unit(self, ru_id: int) -> int | None:
        for element_id in self._ru_elements.get(ru_id, []):
            obj = self._element_objects.get(element_id)
            if obj is not None and obj[0] == "hru":
                return obj[1]
        return None

    def _add_feeder_hrus(self, selected: list[int], keep: dict[str, set[int]]) -> dict[str, set[int]]:
        """W1: give every kept channel that has only channel inflows a routing-unit feeder.

        SWAT+ main/dev ch_temp reads hin_d(in-1), index 0, when the first inflow of a channel
        is another channel. The full dataset gives every channel a routing-unit inflow, so keep
        one HRU of the unit that feeds it, and trace again until no such channel is left.
        """
        while True:
            channels = self._channel_only_channels(keep)
            if not channels:
                return keep
            added_this_round: set[tuple[str, int]] = set()
            for channel_id in channels:
                feeders = self._feeders_of_channel(channel_id)
                if any(feeder in added_this_round for feeder in feeders):
                    continue
                choice = None
                for feeder_typ, feeder_id in feeders:
                    hru_id = feeder_id if feeder_typ == "hru" else self._hru_of_routing_unit(feeder_id)
                    if hru_id is not None and hru_id not in selected:
                        choice = (feeder_typ, feeder_id, hru_id)
                        break
                label = self._names.get(("sdc", channel_id), "")
                if choice is None:
                    print(f"  WARNING: channel {channel_id} {label} has only channel inflows and no feeder HRU was found.")
                    continue
                feeder_typ, feeder_id, hru_id = choice
                feeder_label = self._names.get((feeder_typ, feeder_id), "")
                reason = (
                    f"channel {channel_id} ({label}) had only channel inflows (SWAT+ ch_temp reads hin_d(0)); "
                    f"{feeder_typ} {feeder_id} ({feeder_label}) feeds it in the full dataset, so its HRU {hru_id} was added"
                )
                self.added_hrus.append({
                    "hru_id": hru_id,
                    "reason": reason,
                    "channel_id": channel_id,
                    "feeder_type": feeder_typ,
                    "feeder_id": feeder_id,
                })
                selected.append(hru_id)
                added_this_round.add((feeder_typ, feeder_id))
                print(f"  Added feeder HRU {hru_id}: {reason}")
            if not added_this_round:
                return keep
            selected.sort()
            keep = self._compute_keep(selected)

    def _parse_con_file(self, path: str) -> dict[int, list[str]]:
        rows: dict[int, list[str]] = {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return rows
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                rows[int(fields[0])] = fields
            except ValueError:
                continue
        return rows

    def _expand_element_tokens(self, tokens: list[str]) -> list[int]:
        return expand_element_tokens(tokens)

    def _extract_routing_targets(self, fields: list[str]) -> list[tuple[str, int, str, float]]:
        targets: list[tuple[str, int, str, float]] = []
        try:
            src_tot = int(fields[12])
        except (IndexError, ValueError):
            return targets
        for index in range(src_tot):
            base = 13 + index * 4
            if base + 3 >= len(fields):
                break
            obj_typ = fields[base]
            try:
                obj_id = int(fields[base + 1])
            except ValueError:
                continue
            hyd_typ = fields[base + 2]
            try:
                frac = float(fields[base + 3])
            except ValueError:
                frac = 1.0
            targets.append((obj_typ, obj_id, hyd_typ, frac))
        return targets

    def _find_routing_units_for_hrus(self, hru_ids: list[int]) -> set[int]:
        hru_set = set(hru_ids)
        ele_path = os.path.join(self.dir, "rout_unit.ele")
        hru_elem_ids: set[int] = set()
        if os.path.isfile(ele_path):
            with open(ele_path, "r") as file:
                lines = file.readlines()
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 4:
                    continue
                try:
                    elem_id = int(fields[0])
                    obj_typ = fields[2]
                    obj_typ_no = int(fields[3])
                except (ValueError, IndexError):
                    continue
                if obj_typ == "hru" and obj_typ_no in hru_set:
                    hru_elem_ids.add(elem_id)

        def_path = os.path.join(self.dir, "rout_unit.def")
        ru_ids: set[int] = set()
        if os.path.isfile(def_path):
            with open(def_path, "r") as file:
                lines = file.readlines()
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 3:
                    continue
                try:
                    ru_id = int(fields[0])
                    num_elem = int(fields[2])
                except (ValueError, IndexError):
                    continue
                elem_ids = set(self._expand_element_tokens(fields[3 : 3 + num_elem]))
                if elem_ids & hru_elem_ids:
                    ru_ids.add(ru_id)
        return ru_ids

    def _filter_con_file(
        self,
        path: str,
        kept_ids: set[int],
        my_map: dict[int, int],
        all_maps: dict[str, dict[int, int]],
    ) -> set[int]:
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return set()

        header = lines[0]
        col_header = lines[1]
        col_names = col_header.split()
        id_idx = 0
        props_idx = 7 if len(col_names) > 7 else None
        src_idx = next((i for i, col in enumerate(col_names) if col.lower() == "src_tot"), 12)

        kept_strs = {str(item) for item in kept_ids}
        selected: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if fields and fields[id_idx] in kept_strs:
                selected.append(fields)

        original_props: set[int] = set()
        if props_idx is not None:
            for fields in selected:
                if props_idx < len(fields):
                    try:
                        original_props.add(int(fields[props_idx]))
                    except ValueError:
                        pass
        props_map = {old: new for new, old in enumerate(sorted(original_props), start=1)}

        renumbered: list[list[str]] = []
        for fields in selected:
            old_id = int(fields[id_idx])
            fields[id_idx] = str(my_map[old_id])
            if props_idx is not None and props_idx < len(fields):
                try:
                    fields[props_idx] = str(props_map[int(fields[props_idx])])
                except (ValueError, KeyError):
                    pass

            try:
                src_tot = int(fields[src_idx])
            except (IndexError, ValueError):
                src_tot = 0
            new_targets: list[list[str]] = []
            for index in range(src_tot):
                typ_col = src_idx + 1 + index * 4
                id_col = typ_col + 1
                hyd_col = typ_col + 2
                frac_col = typ_col + 3
                if frac_col >= len(fields):
                    break
                target_typ = fields[typ_col]
                try:
                    target_old_id = int(fields[id_col])
                except ValueError:
                    continue
                target_map = all_maps.get(target_typ, {})
                if target_old_id in target_map:
                    new_targets.append([
                        target_typ,
                        str(target_map[target_old_id]),
                        fields[hyd_col],
                        fields[frac_col],
                    ])

            base = fields[:src_idx]
            base.append(str(len(new_targets)))
            for target in new_targets:
                base.extend(target)
            renumbered.append(base)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(8) for value in row) + "\n")
        print(f"  {os.path.basename(path)}: kept {len(renumbered)} rows")
        return original_props

    def _filter_data_file(self, path: str, kept_ids: set[int], id_map: dict[int, int]) -> None:
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        kept_strs = {str(item) for item in kept_ids}
        renumbered: list[str] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields or fields[0] not in kept_strs:
                continue
            old_id = int(fields[0])
            new_id = id_map[old_id]
            rest = line.split(maxsplit=1)
            if len(rest) > 1:
                renumbered.append(f"{new_id:>8} {rest[1]}")
            else:
                renumbered.append(f"{new_id:>8}\n")

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for line in renumbered:
                file.write(line if line.endswith("\n") else line + "\n")
        print(f"  {os.path.basename(path)}: kept {len(renumbered)} rows")

    def _filter_rout_unit_ele(self, keep: dict[str, set[int]], id_maps: dict[str, dict[int, int]]) -> None:
        path = os.path.join(self.dir, "rout_unit.ele")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        selected: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) < 4:
                continue
            obj_typ = fields[2]
            try:
                obj_typ_no = int(fields[3])
            except ValueError:
                continue
            if obj_typ in keep and obj_typ_no in keep[obj_typ]:
                selected.append(fields)

        self._elem_id_map = {}
        renumbered: list[list[str]] = []
        for new_elem_id, fields in enumerate(selected, start=1):
            old_elem_id = int(fields[0])
            self._elem_id_map[old_elem_id] = new_elem_id
            fields[0] = str(new_elem_id)
            obj_typ = fields[2]
            old_obj_no = int(fields[3])
            type_map = id_maps.get(obj_typ, {})
            if old_obj_no in type_map:
                fields[3] = str(type_map[old_obj_no])
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(12) for value in row) + "\n")
        print(f"  rout_unit.ele: kept {len(renumbered)} elements")

    def _filter_rout_unit_def(self, kept_ru_ids: set[int], id_maps: dict[str, dict[int, int]]) -> None:
        path = os.path.join(self.dir, "rout_unit.def")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        ru_map = id_maps.get("ru", {})
        kept_strs = {str(item) for item in kept_ru_ids}
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields or fields[0] not in kept_strs:
                continue
            old_ru_id = int(fields[0])
            fields[0] = str(ru_map.get(old_ru_id, old_ru_id))
            try:
                num_elem = int(fields[2])
            except ValueError:
                num_elem = 0
            old_elements = self._expand_element_tokens(fields[3 : 3 + num_elem])
            new_elem_refs = [
                str(self._elem_id_map[old_elem])
                for old_elem in old_elements
                if old_elem in self._elem_id_map
            ]
            fields[2] = str(len(new_elem_refs))
            renumbered.append(fields[:3] + new_elem_refs)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(12) for value in row) + "\n")
        print(f"  rout_unit.def: kept {len(renumbered)} routing units")

    def _renumber_rout_unit_rtu_def(self, ru_map: dict[int, int]) -> None:
        """rout_unit.rtu DEF names a rout_unit.def row; those rows were renumbered."""
        path = os.path.join(self.dir, "rout_unit.rtu")
        if not os.path.isfile(path):
            return
        lines, eol = read_text_lines(path)
        if len(lines) < 3:
            return
        def_idx = column_index(lines[1].split(), {"def"}, 2)
        for index in range(2, len(lines)):
            fields = lines[index].split()
            if len(fields) <= def_idx:
                continue
            try:
                old_def = int(fields[def_idx])
            except ValueError:
                continue
            if old_def in ru_map:
                lines[index] = replace_token(lines[index], def_idx, str(ru_map[old_def]))
        write_text_lines(path, lines, eol)

    def _filter_aqu_cha_lin(self, id_maps: dict[str, dict[int, int]]) -> None:
        """Keep the retained aquifers of aqu_cha.lin, renumbered, with their channels mapped to the new ids.

        aqu2d_read allocates aq_ch(sp_ob%aqu) but then fills aq_ch(id) for every id in the file,
        so a file that still lists the full dataset's aquifers writes past the array.
        """
        path = os.path.join(self.dir, "aqu_cha.lin")
        if not os.path.isfile(path):
            return
        lines, eol = read_text_lines(path)
        if len(lines) < 2:
            return
        aqu_map = id_maps.get("aqu", {})
        sdc_map = id_maps.get("sdc", {})
        rows: list[tuple[int, str, list[str]]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) < 3:
                continue
            try:
                old_id = int(fields[0])
                token_count = int(fields[2])
            except ValueError:
                continue
            if old_id not in aqu_map:
                continue
            channels = expand_element_tokens(fields[3 : 3 + token_count])
            kept = sorted({sdc_map[channel] for channel in channels if channel in sdc_map})
            rows.append((aqu_map[old_id], fields[1], compress_element_ids(kept)))
        rows.sort(key=lambda row: row[0])
        out = lines[:2]
        for new_id, name, tokens in rows:
            out.append(
                f"{new_id:>12}  {name:>15}  {len(tokens):>10}  " + "  ".join(f"{token:>5}" for token in tokens)
            )
        write_text_lines(path, [line.rstrip() for line in out], eol)
        print(f"  aqu_cha.lin: kept {len(rows)} aquifer(s)")

    def _update_file_cio(self, keep: dict[str, set[int]], extra_null: list[str] | None = None) -> None:
        always_null = {
            "water_allocation.wro",
            "element.wro",
            "water_rights.wro",
            "object.prt",
        }
        always_null.update(extra_null or ())
        for typ, (con_file, data_file) in OBJ_TYPE_FILES.items():
            if typ not in keep:
                always_null.add(con_file)
                if data_file:
                    always_null.add(data_file)

        path = os.path.join(self.dir, "file.cio")
        with open(path, "r") as file:
            content = file.read()
        for param in always_null:
            pattern = re.compile(rf"\b{re.escape(param)}\b", re.IGNORECASE)
            if pattern.search(content):
                content = pattern.sub("null", content)
                print(f"    {param} -> null")
        with open(path, "w") as file:
            file.write(content)
        print("  file.cio updated")


def find_swat_executable(directory: Path, explicit: str | None) -> Path:
    if explicit:
        exe = Path(explicit).resolve()
        if not exe.is_file():
            raise ValueError(f"Invalid executable path: {exe}")
        return exe

    candidates = [path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".exe"]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise ValueError("No SWAT+ executable found in the generated folder.")
    names = ", ".join(path.name for path in candidates)
    raise ValueError(f"Multiple executables found. Provide --exe. Found: {names}")


def run_swat(directory: Path, exe_path: Path) -> None:
    print(f"Running SWAT+ simulation with executable: {exe_path}")
    with subprocess.Popen(
        [str(exe_path)],
        cwd=str(directory),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    ) as process:
        assert process.stdout is not None
        while True:
            raw_output = process.stdout.readline()
            if raw_output == b"" and process.poll() is not None:
                break
            output = raw_output.decode("latin-1", errors="replace").strip()
            if output:
                print(output)
        if process.returncode != 0:
            raise RuntimeError(f"SWAT+ exited with code {process.returncode}.")
    print("SWAT+ simulation completed successfully.")


def process_hru_subset(
    dataset: str,
    hru_ids: list[int],
    keep_routing: bool = False,
    run_simulation: bool = False,
    exe_path: str | None = None,
    output_dir: str | None = None,
    overwrite: bool = False,
    exact_hrus: bool = False,
    keep_wetland_file: bool = False,
    main_compat: bool = False,
    no_outputs: bool = False,
) -> dict[str, Any]:
    source_dir = resolve_txtinout_dir(dataset)
    dest_folder_name = (
        f"solo_{hru_ids[0]}"
        if len(hru_ids) == 1
        else f"multi_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    requested_dest = Path(output_dir).resolve() if output_dir else source_dir / dest_folder_name
    dest_dir = copy_swat(source_dir, requested_dest, overwrite=overwrite)

    workarounds_applied: list[str] = []
    added_hru_ids: list[dict[str, Any]] = []

    if keep_routing:
        tracer = RoutingTracer(dest_dir, add_feeder_hrus=not exact_hrus)
        keep, id_maps = tracer.trace_and_filter(hru_ids)
        retained_counts = {key: len(value) for key, value in keep.items()}
        added_hru_ids = tracer.added_hrus
        if added_hru_ids:
            workarounds_applied.append("W1")
    else:
        modifier = FileModifier(dest_dir)
        props_ids = modifier.modify_hru_con(hru_ids)
        modifier.modify_hru_data(props_ids if props_ids else hru_ids)
        modifier.modify_secondary_references()
        modifier.modify_object_cnt(len(hru_ids))
        extra_null = modifier.modify_region_files()
        modifier.modify_file_cio(extra_nullify=set(extra_null))
        modifier.disable_print_objects({
            "lsunit_wb",
            "lsunit_nb",
            "lsunit_ls",
            "lsunit_pw",
            "ru",
            "ru_salt",
            "ru_cs",
        })
        id_maps = {"hru": modifier.hru_id_map}
        retained_counts = {"hru": len(hru_ids)}

    if not keep_wetland_file and compact_hydrology_wet(dest_dir)["removed"]:
        workarounds_applied.append("W2")
    if main_compat:
        apply_main_compat(dest_dir)
        workarounds_applied.append("W3")
    if no_outputs:
        silenced = edit_print_prt(dest_dir, silence=True)["silenced"]
        print(f"no-outputs: switched off {silenced} print.prt object row(s).")
        workarounds_applied.append("W4")

    if workarounds_applied:
        print(f"Workarounds applied: {', '.join(workarounds_applied)} (see scripts/SWAT_WORKAROUNDS.md)")

    simulation_exe: str | None = None
    if run_simulation:
        exe = find_swat_executable(dest_dir, exe_path)
        simulation_exe = str(exe)
        run_swat(dest_dir, exe)

    return {
        "ok": True,
        "source_dir": str(source_dir),
        "output_dir": str(dest_dir),
        "hru_ids": hru_ids,
        "keep_routing": keep_routing,
        "run_simulation": run_simulation,
        "simulation_exe": simulation_exe,
        "options": {
            "exact_hrus": exact_hrus,
            "keep_wetland_file": keep_wetland_file,
            "main_compat": main_compat,
            "no_outputs": no_outputs,
        },
        "retained_counts": retained_counts,
        "added_hru_ids": added_hru_ids,
        "workarounds_applied": workarounds_applied,
        "id_maps": {
            key: {str(old): new for old, new in value.items()}
            for key, value in id_maps.items()
        },
    }


def inspect_hru_range(dataset: str) -> dict[str, Any]:
    source_dir = resolve_txtinout_dir(dataset)
    minimum, maximum, total = FileModifier(source_dir).get_hru_range()
    return {
        "ok": True,
        "source_dir": str(source_dir),
        "min_hru": minimum,
        "max_hru": maximum,
        "total_hrus": total,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create a SWAT+ subset for selected HRUs.")
    parser.add_argument("--dataset", help="SWAT+ dataset or TxtInOut folder.")
    parser.add_argument("--hru-ids", help="HRU IDs and ranges, for example: 1,4-6,10.")
    parser.add_argument("--keep-routing", action="store_true", help="Preserve downstream routing.")
    parser.add_argument(
        "--exact-hrus",
        action="store_true",
        help="With --keep-routing, keep only the requested HRUs. By default one HRU is added for each kept "
        "channel that would have only channel inflows (workaround W1).",
    )
    parser.add_argument(
        "--keep-wetland-file",
        action="store_true",
        help="Keep hydrology.wet as it is. By default only the rows the kept wetlands use are kept (workaround W2).",
    )
    parser.add_argument(
        "--main-compat",
        action="store_true",
        help="Make the subset run on SWAT+ main/dev: water allocation off and NAM-only print.prt rows removed "
        "(workaround W3).",
    )
    parser.add_argument(
        "--no-outputs",
        action="store_true",
        help="Switch every print.prt object row off, so the subset writes no output tables (W4).",
    )
    parser.add_argument("--run-swat", action="store_true", help="Run SWAT+ after creating the subset.")
    parser.add_argument("--exe", help="SWAT+ executable path for --run-swat.")
    parser.add_argument("--output-dir", help="Destination folder. Defaults under the source TxtInOut folder.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite output folder if it exists.")
    parser.add_argument("--hru-range", action="store_true", help="Print HRU range/count only.")
    parser.add_argument(
        "--check-swat-source",
        metavar="SWATPLUS_DIR",
        help="Grep a SWAT+ checkout for the defects the workarounds cover and print, as JSON, which "
        "workarounds are still needed.",
    )
    parser.add_argument(
        "--print-workarounds",
        action="store_true",
        help="Print scripts/SWAT_WORKAROUNDS.md (rendered from the registry) and exit.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.print_workarounds:
            sys.stdout.write(render_workarounds_markdown())
            return 0
        if args.check_swat_source:
            print(json.dumps(check_swat_source(args.check_swat_source), indent=2))
            return 0
        if not args.dataset:
            raise ValueError("--dataset is required.")
        if args.hru_range:
            if args.json:
                with contextlib.redirect_stdout(sys.stderr):
                    result = inspect_hru_range(args.dataset)
            else:
                result = inspect_hru_range(args.dataset)
        else:
            if not args.hru_ids:
                raise ValueError("--hru-ids is required unless --hru-range is used.")
            hru_ids = parse_filter_ids(args.hru_ids)
            options = dict(
                dataset=args.dataset,
                hru_ids=hru_ids,
                keep_routing=args.keep_routing,
                run_simulation=args.run_swat,
                exe_path=args.exe,
                output_dir=args.output_dir,
                overwrite=args.overwrite,
                exact_hrus=args.exact_hrus,
                keep_wetland_file=args.keep_wetland_file,
                main_compat=args.main_compat,
                no_outputs=args.no_outputs,
            )
            if args.json:
                with contextlib.redirect_stdout(sys.stderr):
                    result = process_hru_subset(**options)
            else:
                result = process_hru_subset(**options)

        if args.json:
            print(json.dumps(result, indent=2))
        elif args.hru_range:
            print(
                f"HRU range: {result['min_hru']} - {result['max_hru']} "
                f"({result['total_hrus']} total)"
            )
        else:
            print(f"Subset created: {result['output_dir']}")
        return 0
    except Exception as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
