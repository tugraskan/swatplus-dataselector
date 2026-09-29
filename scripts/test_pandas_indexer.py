#!/usr/bin/env python3
"""Unit tests for pandas_indexer.py.

Run with:  python3 -m unittest scripts.test_pandas_indexer
       or:  python3 scripts/test_pandas_indexer.py
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas_indexer as p  # noqa: E402

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "resources" / "schema"

FILE_CIO = "file.cio: written by test\nsimulation  time.sim  print.prt\n"
AQU_CATUNIT = "aqu_catunit.def: written by test\nid  name  elem\n1  acu1  1\n"
TOPOGRAPHY = "topography.hyd: written by test\nid  name  slp\n1  topo1  0.05\n"


class TestBuildIndexIncompleteTables(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.dataset = self.root / "TxtInOut"
        self.dataset.mkdir()
        (self.dataset / "file.cio").write_text(FILE_CIO, encoding="utf-8")
        (self.dataset / "aqu_catunit.def").write_text(AQU_CATUNIT, encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def _write_json(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_table_without_table_name_is_skipped(self):
        (self.dataset / "topography.hyd").write_text(TOPOGRAPHY, encoding="utf-8")
        schema = self._write_json("schema.json", {
            "schema_version": "test",
            "tables": {
                # Shaped like an overlay-only entry in the enriched schema.
                "aqu_catunit.def": {
                    "file_name": "aqu_catunit.def",
                    "origin": "overlay-only",
                    "doc": {"summary": ["documentation only"]},
                    "columns": [],
                },
                "topography.hyd": {
                    "file_name": "topography.hyd",
                    "table_name": "topography_hyd",
                    "has_metadata_line": True,
                    "has_header_line": True,
                    "data_starts_after": 2,
                    "columns": [
                        {"name": "id", "db_column": "id", "type": "AutoField",
                         "is_primary_key": True, "is_foreign_key": False},
                        {"name": "name", "db_column": "name", "type": "CharField",
                         "is_primary_key": False, "is_foreign_key": False},
                        {"name": "slp", "db_column": "slp", "type": "DoubleField",
                         "is_primary_key": False, "is_foreign_key": False},
                    ],
                },
            },
        })
        metadata = self._write_json("metadata.json", {})

        payload = p.build_index(self.dataset, schema, metadata)

        # The incomplete table is left out; the complete one still indexes.
        self.assertNotIn("aqu_catunit.def", payload["fileTableMap"])
        self.assertEqual(payload["fileTableMap"].get("topography.hyd"), "topography_hyd")
        rows = payload["tables"]["topography_hyd"]
        self.assertEqual([row["values"]["name"] for row in rows], ["topo1"])

    def test_shipped_enriched_schema_does_not_crash_the_build(self):
        # Regression: selecting the enriched schema raised KeyError: 'table_name'
        # on any dataset containing one of its overlay-only files.
        enriched = SCHEMA_DIR / "swatplus-schema-enriched.json"
        metadata = SCHEMA_DIR / "txtinout-metadata.json"
        if not enriched.exists() or not metadata.exists():
            self.skipTest("shipped schema files not present")

        payload = p.build_index(self.dataset, enriched, metadata)

        self.assertIn("file.cio", payload["fileTableMap"])
        self.assertNotIn("aqu_catunit.def", payload["fileTableMap"])


if __name__ == "__main__":
    unittest.main()
