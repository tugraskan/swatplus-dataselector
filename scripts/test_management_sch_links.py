#!/usr/bin/env python3
"""Unit tests for the management.sch operation-line links in pandas_indexer.py.

The expected links are what read_mgtops.f90 (SWAT+ 62.0.x) looks up: it reads
op, mon, day, husc, op_char (op_data1), op_plant (op_data2), op3.

Run with:  python3 -m unittest scripts.test_management_sch_links
"""

import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas_indexer as p  # noqa: E402

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "resources" / "schema"
NULLS = ["null", "0", ""]


def op_line(op, op_data1="null", op_data2="null", op_data3="0.000"):
    return f"        {op}  4  1  0.0  {op_data1}  {op_data2}  {op_data3}\n"


def links(*op_lines, autos=()):
    """(sourceColumn, value, targetTable) for each reference on a schedule."""
    lines = ["management.sch: test\n", "name numb_ops numb_auto ...\n",
             f"sched_1  {len(op_lines)}  {len(autos)}\n",
             *(f"        {name}\n" for name in autos), *op_lines]
    refs = p.process_management_sch_child_lines(
        Path("management.sch"), {"table_name": "management_sch"}, lines,
        start_line=3, numb_auto=len(autos), numb_ops=len(op_lines), fk_null_values=NULLS)
    return [(r["sourceColumn"], r["fkValue"], r["targetTable"]) for r in refs]


class TestOperationLinks(unittest.TestCase):

    def test_op_data1_lookups(self):
        cases = {
            "pcom": "plant_ini", "plnt": "plants_plt", "till": "tillage_til",
            "irrm": "irr_ops", "irrp": "irr_ops", "fert": "fertilizer_frt",
            "manu": "manure_db_frt", "pest": "pesticide_pes", "graz": "graze_ops",
            "burn": "fire_ops", "swep": "sweep_ops",
        }
        for op, table in cases.items():
            with self.subTest(op=op):
                self.assertEqual(links(op_line(op, "thing")), [(f"op_data1({op})", "thing", table)])

    def test_op_data2_lookups(self):
        cases = {
            "plnt": "transplant_plt", "harv": "harv_ops", "hvkl": "harv_ops",
            "fert": "chem_app_ops", "manu": "chem_app_ops", "pest": "chem_app_ops",
        }
        for op, table in cases.items():
            with self.subTest(op=op):
                self.assertEqual(links(op_line(op, "null", "thing")), [(f"op_data2({op})", "thing", table)])

    def test_harvest_plant_name_is_not_a_link(self):
        # mgt_sched.f90 compares harv/hvkl/kill's op_data1 with the HRU's plant
        # community at run time; read_mgtops.f90 looks up nothing for it.
        self.assertEqual(links(op_line("hvkl", "corn", "grain")), [("op_data2(hvkl)", "grain", "harv_ops")])
        self.assertEqual(links(op_line("harv", "corn", "residue")), [("op_data2(harv)", "residue", "harv_ops")])
        self.assertEqual(links(op_line("kill", "corn")), [])

    def test_both_columns_on_one_line(self):
        self.assertEqual(links(op_line("fert", "elem_n", "broadcast", "181.400")), [
            ("op_data1(fert)", "elem_n", "fertilizer_frt"),
            ("op_data2(fert)", "broadcast", "chem_app_ops"),
        ])

    def test_op_data3_is_never_a_link(self):
        self.assertEqual(links(op_line("till", "chisplow", "null", "fldcult")),
                         [("op_data1(till)", "chisplow", "tillage_til")])

    def test_ops_read_mgtops_does_not_look_up(self):
        for op in ("kill", "skip", "irra", "frta", "frtc", "pstc", "cnup", "weir"):
            with self.subTest(op=op):
                self.assertEqual(links(op_line(op, "thing", "thing")), [])

    def test_null_values_and_short_lines(self):
        self.assertEqual(links(op_line("fert", "null", "NULL")), [])
        self.assertEqual(links("        plnt  4  28  0.0  corn\n"), [("op_data1(plnt)", "corn", "plants_plt")])

    def test_auto_lines_are_decision_tables(self):
        self.assertEqual(links(op_line("till", "chisplow"), autos=("irr_year_irr",)), [
            ("auto_op_dtl", "irr_year_irr", "lum_dtl"),
            ("op_data1(till)", "chisplow", "tillage_til"),
        ])

    def test_every_target_is_a_schema_table(self):
        schema_path = SCHEMA_DIR / "swatplus-generated-schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        table_names = {t.get("table_name") for t in schema["tables"].values()}
        for op, columns in p.MANAGEMENT_SCH_OP_LINKS.items():
            for column, table in columns.items():
                with self.subTest(op=op, column=column):
                    self.assertIn(column, p.MANAGEMENT_SCH_OP_DATA_INDEX)
                    self.assertIn(table, table_names)


if __name__ == "__main__":
    unittest.main()
