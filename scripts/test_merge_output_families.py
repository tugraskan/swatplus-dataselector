#!/usr/bin/env python3
"""Unit tests for merge_output_families.py.

Run with:  python3 -m unittest scripts.test_merge_output_families
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import merge_output_families as m  # noqa: E402


SAMPLE = """# `aquifer_*`

**Kind:** output family
**Files covered:** `aquifer_day`, `aquifer_mon`, `aquifer_yr`, `aquifer_aa` text/CSV pairs

## Bottom Line

`aquifer_*` is the aquifer water balance output family.

> **What each row means:** one aquifer object's water and nitrogen budget for one
> reporting period.

## Columns Written

| Column | Unit | Source Field | Source-Backed Meaning |
|---|---|---|---|
| `jday` |  | `time%day` | Julian day of the reporting period. |
| `flo` | mm | `aqu_*(iaq)%flo` | lateral flow from aquifer |
| `dep_wt` | m | `aqu_*(iaq)%dep_wt` | average depth to water table |
"""


class TestParsing(unittest.TestCase):
    def test_family_name(self):
        self.assertEqual(m.parse_family_name(SAMPLE), 'aquifer_*')

    def test_files_covered_strips_backticks_and_extensions(self):
        covered = m.parse_files_covered(SAMPLE)
        self.assertEqual(covered,
                         ['aquifer_day', 'aquifer_mon', 'aquifer_yr', 'aquifer_aa'])

    def test_columns_table(self):
        cols = m.parse_columns_table(SAMPLE)
        names = [c['name'] for c in cols]
        self.assertEqual(names, ['jday', 'flo', 'dep_wt'])
        flo = next(c for c in cols if c['name'] == 'flo')
        self.assertEqual(flo['units'], 'mm')
        self.assertEqual(flo['source_field'], 'aqu_*(iaq)%flo')
        self.assertEqual(flo['description'], 'lateral flow from aquifer')
        # empty unit cell becomes None
        jday = next(c for c in cols if c['name'] == 'jday')
        self.assertIsNone(jday['units'])

    def test_summary_prefers_what_each_row_means(self):
        summary = m.parse_summary(SAMPLE)
        self.assertTrue(summary.startswith("one aquifer object's water"))
        self.assertNotIn('\n', summary)

    def test_build_column_doc_omits_empty(self):
        doc = m.build_column_doc(
            {'name': 'jday', 'units': None, 'source_field': 'time%day',
             'description': 'Julian day'})
        self.assertEqual(doc, {'description': 'Julian day', 'source_field': 'time%day'})
        self.assertNotIn('units', doc)


class TestCleaners(unittest.TestCase):
    def test_clean_units_drops_placeholders(self):
        for empty in ('', 'none', '-', 'NA'):
            self.assertIsNone(m.clean_units(empty))
        self.assertEqual(m.clean_units('mm'), 'mm')

    def test_clean_strips_backticks(self):
        self.assertEqual(m.clean('`flo`'), 'flo')
        self.assertIsNone(m.clean('  '))


if __name__ == '__main__':
    unittest.main()
