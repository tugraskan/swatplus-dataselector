#!/usr/bin/env python3
"""Unit tests for merge_overlays.py.

Run with:  python3 -m unittest scripts.test_merge_overlays
       or:  python3 scripts/test_merge_overlays.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import merge_overlays as m  # noqa: E402


class TestNormalization(unittest.TestCase):
    def test_norm_file_folds_hyphen_and_case(self):
        self.assertEqual(m.norm_file("cal-parms.cal"), "cal_parms.cal")
        self.assertEqual(m.norm_file("Aquifer.AQU"), "aquifer.aqu")
        self.assertEqual(m.norm_file("cal_parms.cal"), "cal_parms.cal")

    def test_norm_col_strips_underscores(self):
        self.assertEqual(m.norm_col("gw_flo"), "gwflo")
        self.assertEqual(m.norm_col("FLO_MIN"), "flomin")


class TestValueCleaning(unittest.TestCase):
    def test_clean_units_drops_placeholders(self):
        for empty in ("", "none", "-", "NA", "n/a", "None"):
            self.assertIsNone(m.clean_units(empty))
        self.assertEqual(m.clean_units(" mm "), "mm")

    def test_clean_default_drops_dash(self):
        self.assertIsNone(m.clean_default("-"))
        self.assertIsNone(m.clean_default(""))
        self.assertEqual(m.clean_default("0.05"), "0.05")


class TestColumnMatching(unittest.TestCase):
    def _cols(self, names, first_is_id=False):
        cols = []
        for i, n in enumerate(names):
            col = {"name": n, "db_column": n}
            if first_is_id and i == 0:
                col["type"] = "AutoField"
            cols.append(col)
        return cols

    def _rows(self, headers, start=1):
        return [{"header": h, "column": str(start + i),
                 "manual_description": f"desc {h}", "source_meaning": f"mean {h}"}
                for i, h in enumerate(headers)]

    def test_header_exact_match(self):
        cols = self._cols(["id", "gw_flo", "dep_wt"])
        rows = self._rows(["id", "gw_flo", "dep_wt"])
        matches, unmatched = m.match_columns(cols, rows)
        self.assertEqual(len(matches), 3)
        self.assertEqual(matches[1][1], "header")
        self.assertEqual(unmatched, [])

    def test_header_normalized_match(self):
        # schema "gw_flo" vs overlay header "gwflo" (underscore stripped)
        cols = self._cols(["gw_flo"])
        rows = self._rows(["gwflo"])
        matches, _ = m.match_columns(cols, rows)
        self.assertIn(0, matches)
        self.assertEqual(matches[0][1], "header-normalized")

    def test_target_field_match_when_header_empty(self):
        # Empty headers: match by the Fortran field name in the target.
        cols = self._cols(["id", "gampt", "pet"])
        rows = [
            {"header": "", "column": "1", "target": "bsn_cc%gampt",
             "manual_description": "green-ampt"},
            {"header": "", "column": "2", "target": "bsn_cc%pet",
             "manual_description": "pet method"},
        ]
        matches, _ = m.match_columns(cols, rows)
        # gampt (schema idx1) matches target bsn_cc%gampt regardless of position
        self.assertEqual(matches[1][1], "target")
        self.assertEqual(matches[1][0]["manual_description"], "green-ampt")
        self.assertEqual(matches[2][0]["manual_description"], "pet method")

    def test_no_position_fallback(self):
        # Columns that match neither header nor target are left unenriched,
        # never matched by position (schema order != file order in reality).
        cols = self._cols(["id", "alpha", "beta"], first_is_id=True)
        rows = [
            {"header": "", "column": "2", "target": "mod%zzz",
             "manual_description": "unrelated"},
        ]
        matches, _ = m.match_columns(cols, rows)
        self.assertEqual(matches, {})

    def test_title_rows_are_ignored(self):
        # A title/dummy row must never be matched to a data column.
        cols = self._cols(["id", "name"], first_is_id=True)
        rows = [
            {"header": "Title line", "column": "1", "target": "titldum",
             "manual_description": "a title"},
            {"header": "name", "column": "2", "manual_description": "the name"},
        ]
        matches, _ = m.match_columns(cols, rows)
        descs = [row.get("manual_description") for row, _ in matches.values()]
        self.assertNotIn("a title", descs)
        self.assertEqual(matches[1][0]["manual_description"], "the name")


class TestFieldFromTarget(unittest.TestCase):
    def test_strips_module_prefix_and_index(self):
        self.assertEqual(m.field_from_target("bsn_cc%gampt"), "gampt")
        self.assertEqual(m.field_from_target("aqudb%flo"), "flo")
        self.assertEqual(m.field_from_target("dr_salt_name(ii)"), "dr_salt_name")

    def test_rejects_aggregate_expressions(self):
        self.assertIsNone(m.field_from_target("(dr_salt(ii)%salt(i), i=1,n)"))
        self.assertIsNone(m.field_from_target(""))
        self.assertIsNone(m.field_from_target(None))


class TestParentCandidates(unittest.TestCase):
    def test_child_to_parent(self):
        self.assertIn("calibration.cal",
                      m.parent_candidates("calibration_cal.cond"))
        self.assertIn("ch_sed_budget.sft",
                      m.parent_candidates("ch_sed_budget_sft.item"))

    def test_no_candidate_without_underscore(self):
        self.assertEqual(m.parent_candidates("aquifer.aqu"), [])


class TestOverlayOnlySynthesis(unittest.TestCase):
    def test_synthesize(self):
        overlay_data = {
            "links": {"source": "reader.f90"},
            "primary_target": "`foo`",
            "bottom_line": ["It does a thing."],
            "file_variables": [
                {"header": "id", "column": "1", "manual_description": "row id",
                 "units": "none", "type": "integer", "target": "k",
                 "source_line": "reader.f90:10"},
                {"header": "val", "column": "2", "manual_description": "a value",
                 "units": "mm", "default": "0.0", "source_line": "reader.f90:11"},
            ],
        }
        entry = m.synthesize_overlay_only_table("test.gw", overlay_data)
        self.assertEqual(entry["origin"], "overlay-only")
        self.assertEqual(entry["file_name"], "test.gw")
        self.assertEqual(len(entry["columns"]), 2)
        self.assertEqual(entry["columns"][0]["name"], "id")
        self.assertFalse(entry["columns"][0]["is_foreign_key"])
        self.assertEqual(entry["columns"][0]["doc"]["match"], "overlay")
        # "none" units dropped; "mm" kept
        self.assertNotIn("units", entry["columns"][0]["doc"])
        self.assertEqual(entry["columns"][1]["doc"]["units"], "mm")
        self.assertEqual(entry["doc"]["reader_source"], "reader.f90")
        self.assertEqual(entry["doc"]["summary"], ["It does a thing."])


class TestFileDoc(unittest.TestCase):
    def test_build_file_doc_filters_empty(self):
        doc = m.build_file_doc({
            "links": {"source": ""},
            "primary_target": "  ",
            "bottom_line": ["", "  ", "real text"],
            "module_usage": {"a": "  ", "b": "used"},
            "file_variables_intro": "layout",
        })
        self.assertNotIn("reader_source", doc)
        self.assertNotIn("primary_target", doc)
        self.assertEqual(doc["summary"], ["real text"])
        self.assertEqual(doc["module_usage"], {"b": "used"})
        self.assertEqual(doc["layout_notes"], "layout")


if __name__ == "__main__":
    unittest.main()
