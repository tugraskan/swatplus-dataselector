#!/usr/bin/env python3
"""Unit tests for generate_schema_from_layouts.py.

Run with:  python3 -m unittest scripts.test_generate_schema_from_layouts
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generate_schema_from_layouts as g  # noqa: E402


def col(name, path, vartype="real", repeat=None, description=None, units=None, line=10):
    column = {"name": name, "path": path, "vartype": vartype,
              "declared_at": f"mod.f90:{line}", "description": description, "units": units}
    if repeat:
        column["repeat"] = repeat
    return column


def layout(file_name, columns, preamble=2, extra_records=(), default=True):
    return {
        "file": file_name,
        "filename_is_default": default,
        "readers": ["reader"],
        "preamble": [{"at": "reader.f90:5", "kind": "text", "reads": ["titldum"]}] * preamble,
        "data_starts_after": preamble,
        "records": [{"role": "main", "procedure": "reader", "at": "reader.f90:20",
                     "loops": ["i"], "complete": True, "unresolved": [],
                     "columns": columns}, *extra_records],
    }


def editor_table(file_name, names, fks=(), pks=("name",), types=None):
    types = types or {}
    return {
        "file_name": file_name, "table_name": file_name.replace(".", "_").replace("-", "_"),
        "model_class": "project.x.X", "has_metadata_line": True, "has_header_line": True,
        "data_starts_after": 2,
        "columns": [{"name": n, "db_column": n, "type": types.get(n, "DoubleField"),
                     "nullable": n != "name", "is_primary_key": n in pks,
                     "is_foreign_key": n in dict(fks)} for n in names],
        "primary_keys": list(pks),
        "foreign_keys": [{"column": c, "db_column": c + "_id",
                          "references": {"table": t, "column": "id"}} for c, t in fks],
    }


LAYOUT_FORMAT = {"layout_format": "1", "provenance": {
    "source_commit": "abc123", "source_describe": "62.0.0",
    "source_fingerprint": "fp", "parser_commit": "110c2a2"}}


class Case(unittest.TestCase):
    def header_dir(self, files):
        """A dataset directory holding ``files``, removed after the test."""
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        for name, text in files.items():
            with open(os.path.join(directory.name, name), "w", encoding="utf-8") as handle:
                handle.write(text)
        return directory.name


def build(layouts, editor_tables, headers=(), names=None, metadata=None):
    return g.build_schema({**LAYOUT_FORMAT, "files": layouts},
                          {"source": {"commit": "f8ff21e"}, "tables": editor_tables},
                          metadata or {}, list(headers), names)


class TestHeaderNames(Case):
    def setUp(self):
        self.frt = layout("fertilizer.frt", [
            col("fertnm", "fertdb%fertnm", "character(len=16)"),
            col("fminn", "fertdb%fminn", description="fraction mineral N", units="kg/kg"),
        ])
        self.headers = self.header_dir({"fertilizer.frt":
                                  "title\nname min_n pathogens description\nurea 0.46 null x\n"})

    def test_names_come_from_the_header_by_position(self):
        schema, _ = build({"fertilizer.frt": self.frt}, {}, [self.headers])
        cols = schema["tables"]["fertilizer.frt"]["columns"]
        self.assertEqual([c["name"] for c in cols], ["name", "min_n", "pathogens", "description"])
        self.assertEqual(cols[1]["swat"]["name"], "fminn")
        self.assertEqual(cols[1]["swat"]["read_at"], "reader.f90:20")

    def test_the_unread_tail_is_kept_and_marked(self):
        schema, _ = build({"fertilizer.frt": self.frt}, {}, [self.headers])
        cols = schema["tables"]["fertilizer.frt"]["columns"]
        self.assertEqual([c["read_by_swat"] for c in cols], [True, True, False, False])
        self.assertNotIn("swat", cols[2])
        self.assertNotIn("doc", cols[2])

    def test_docs_are_tamandua_facts_only(self):
        schema, _ = build({"fertilizer.frt": self.frt}, {}, [self.headers])
        doc = schema["tables"]["fertilizer.frt"]["columns"][1]["doc"]
        self.assertEqual(doc, {"description": "fraction mineral N", "units": "kg/kg",
                               "fortran_type": "real", "fortran_target": "fertdb%fminn",
                               "source_ref": "mod.f90:10", "read_at": "reader.f90:20"})

    def test_a_file_missing_its_title_still_yields_its_header(self):
        # Ames's tillage.til: the header is on line 1 and line 2 is data.
        till = layout("tillage.til", [col("tillnm", "tilldb%tillnm", "character"),
                                      col("effmix", "tilldb%effmix")])
        headers = self.header_dir({"tillage.til": "name mix_eff\nbedderd 0.55\n"})
        schema, _ = build({"tillage.til": till}, {}, [headers])
        table = schema["tables"]["tillage.til"]
        self.assertEqual([c["name"] for c in table["columns"]], ["name", "mix_eff"])
        self.assertTrue(table["swat_layout"]["header_source"].endswith("tillage.til:1"))

    def test_the_first_directory_wins(self):
        other = self.header_dir({"fertilizer.frt": "title\nfname fmin\n"})
        schema, _ = build({"fertilizer.frt": self.frt}, {}, [other, self.headers])
        self.assertEqual(schema["tables"]["fertilizer.frt"]["columns"][0]["name"], "fname")

    def test_a_repeating_group_stops_positional_naming(self):
        con = layout("hru.con", [col("num", "ob%num", "integer"),
                                 col("obtyp_out", "ob%obtyp_out", "character", repeat="nout")])
        headers = self.header_dir({"hru.con": "t\nid obj_typ\n"})
        schema, _ = build({"hru.con": con}, {}, [headers])
        cols = schema["tables"]["hru.con"]["columns"]
        self.assertEqual([(c["name"], c["name_source"]) for c in cols],
                         [("id", "header"), ("obtyp_out", "fortran")])
        self.assertEqual(cols[1]["swat"]["repeat"], "nout")


class TestEditorFallbacks(Case):
    def test_editor_names_by_position_only_when_aligned(self):
        read = [col(n, f"db%{n}") for n in ("name", "a", "b", "c", "dd")]
        aligned = editor_table("x.dat", ["name", "a", "b", "c", "d_long"])
        shifted = editor_table("y.dat", ["name", "q", "a", "b", "c"])
        schema, _ = build({"x.dat": layout("x.dat", read), "y.dat": layout("y.dat", read)},
                          {"x.dat": aligned, "y.dat": shifted})
        x = [(c["name"], c["name_source"]) for c in schema["tables"]["x.dat"]["columns"]]
        self.assertEqual(x[-1], ("d_long", "editor-aligned"))
        y = [c["name"] for c in schema["tables"]["y.dat"]["columns"]]
        self.assertEqual(y, ["name", "a", "b", "c", "dd"])  # exact-name matches, not shifted

    def test_learned_names_follow_the_column_not_the_position(self):
        names = {"files": {"x.dat": {"columns": {"db%landuse": "lu_mgt"},
                                     "trailing": ["description"]}}}
        read = [col("name", "db%name", "character"), col("new_one", "db%new_one"),
                col("landuse", "db%landuse", "character")]
        schema, _ = build({"x.dat": layout("x.dat", read)}, {}, names=names)
        cols = schema["tables"]["x.dat"]["columns"]
        self.assertEqual([(c["name"], c["name_source"]) for c in cols], [
            ("name", "fortran"), ("new_one", "fortran"), ("lu_mgt", "learned"),
            ("description", "learned")])
        self.assertFalse(cols[-1]["read_by_swat"])

    def test_learned_names_round_trip(self):
        headers = self.header_dir({"x.dat": "t\nname cn_a cn_b notes\n"})
        read = [col("name", "db%name", "character"), col("cn(1)", "db%cn"), col("cn(2)", "db%cn")]
        schema, _ = build({"x.dat": layout("x.dat", read)}, {}, [headers])
        learned = g.learned_names(schema)
        self.assertEqual(learned["files"]["x.dat"], {
            "columns": {"db%name": "name", "db%cn(1)": "cn_a", "db%cn(2)": "cn_b"},
            "trailing": ["notes"]})


class TestKeysAndLinks(Case):
    def setUp(self):
        self.read = [col("k", "k", "integer"), col("name", "db%name", "character"),
                     col("topo", "db%topo", "character")]
        self.editor = editor_table("hru-data.hru", ["id", "name", "topo", "gone"],
                                   fks=[("topo", "topography_hyd"), ("gone", "nowhere")],
                                   pks=("id",), types={"id": "AutoField"})
        self.headers = self.header_dir({"hru-data.hru": "t\nid name topo\n"})

    def test_links_and_keys_carry_over_by_name(self):
        schema, report = build({"hru-data.hru": layout("hru-data.hru", self.read)},
                               {"hru-data.hru": self.editor}, [self.headers])
        table = schema["tables"]["hru-data.hru"]
        self.assertEqual(table["primary_keys"], ["id"])
        self.assertEqual(table["columns"][0]["type"], "IntegerField")  # physical, not AutoField
        topo = table["columns"][2]
        self.assertEqual((topo["type"], topo["fk_target"]),
                         ("ForeignKeyField", {"table": "topography_hyd", "column": "id"}))
        self.assertEqual([fk["column"] for fk in table["foreign_keys"]], ["topo"])
        self.assertEqual(table["table_name"], "hru_data_hru")
        self.assertIn("gone", report["hru-data.hru"][0])

    def test_structure_comes_from_the_preamble(self):
        schema, _ = build({"a.dat": layout("a.dat", self.read, preamble=1)}, {})
        table = schema["tables"]["a.dat"]
        self.assertEqual((table["has_metadata_line"], table["has_header_line"],
                          table["data_starts_after"]), (True, False, 1))

    def test_row_shape_says_whether_a_value_count_applies(self):
        records = layout("a.dat", self.read)                       # loops: ["i"]
        single = layout("b.dat", self.read)
        single["records"][0]["loops"] = ["do"]                      # the eof wrapper only
        line = {"role": "line", "procedure": "reader", "at": "reader.f90:30",
                "loops": ["do"], "complete": True, "unresolved": [], "columns": self.read[:1]}
        sections = layout("c.dat", self.read, extra_records=[line])
        schema, _ = build({"a.dat": records, "b.dat": single, "c.dat": sections}, {})
        shapes = {f: t["swat_layout"]["rows"] for f, t in schema["tables"].items()}
        self.assertEqual(shapes, {"a.dat": "records", "b.dat": "single", "c.dat": "sections"})

    def test_alternative_widths_are_recorded(self):
        alt = {"role": "alternative", "procedure": "reader", "at": "reader.f90:18",
               "loops": ["i"], "complete": True, "unresolved": [], "columns": self.read[:2]}
        schema, _ = build({"a.dat": layout("a.dat", self.read, extra_records=[alt])}, {})
        self.assertEqual(schema["tables"]["a.dat"]["swat_layout"]["record_widths"], [2, 3])


class TestWhatIsKept(Case):
    def test_special_files_keep_the_editor_structure_with_tamandua_docs(self):
        soils = layout("soils.sol", [col("snam", "soildb%s%snam", "character",
                                         description="soil name")])
        editor = editor_table("soils.sol", ["name", "snam"])
        metadata = {"hierarchical_files": {"description": "x", "soils.sol": {}}}
        schema, _ = build({"soils.sol": soils}, {"soils.sol": editor}, metadata=metadata)
        table = schema["tables"]["soils.sol"]
        self.assertEqual(table["origin"], "editor")
        self.assertEqual([c["name"] for c in table["columns"]], ["name", "snam"])
        self.assertEqual(table["columns"][1]["doc"]["description"], "soil name")
        self.assertNotIn("doc", table["columns"][0])

    def test_editor_only_tables_are_kept_without_docs(self):
        schema, _ = build({}, {"crop-yld.aa": editor_table("crop-yld.aa", ["name", "yld"])})
        table = schema["tables"]["crop-yld.aa"]
        self.assertEqual(table["origin"], "editor")
        self.assertFalse(any("doc" in c for c in table["columns"]))

    def test_expression_filenames_and_incomplete_layouts_are_skipped(self):
        weather = layout("pcp(i)%filename", [col("nbyr", "pcp%nbyr")], default=False)
        broken = layout("b.dat", [col("x", "x")])
        broken["records"][0]["complete"] = False
        schema, _ = build({"pcp(i)%filename": weather, "b.dat": broken}, {})
        self.assertEqual(schema["tables"], {})

    def test_a_new_table_never_reuses_an_editor_table_name(self):
        wet = layout("gwflow.wetland", [col("name", "w%name", "character")])
        other = editor_table("gwflow-wetland.txt", ["name"])
        other["table_name"] = "gwflow_wetland"
        schema, _ = build({"gwflow.wetland": wet}, {"gwflow-wetland.txt": other})
        self.assertEqual(schema["tables"]["gwflow.wetland"]["table_name"], "gwflow_wetland_source")
        self.assertEqual(schema["tables"]["gwflow-wetland.txt"]["table_name"], "gwflow_wetland")

    def test_the_metadata_links_an_editor_table_to_its_real_file(self):
        cons = layout("cons_practice.lum", [col("name", "c%name", "character")])
        editor = editor_table("cons-prac.lum", ["name"])
        editor["table_name"] = "cons_prac_lum"
        metadata = {"table_name_to_file_name": {"cons_prac_lum": "cons_practice.lum"}}
        schema, _ = build({"cons_practice.lum": cons}, {"cons-prac.lum": editor}, metadata=metadata)
        self.assertEqual(list(schema["tables"]), ["cons_practice.lum"])
        self.assertEqual(schema["tables"]["cons_practice.lum"]["table_name"], "cons_prac_lum")

    def test_output_is_deterministic(self):
        layouts = {"a.dat": layout("a.dat", [col("name", "db%name", "character")])}
        first = json.dumps(build(layouts, {})[0], sort_keys=True)
        second = json.dumps(build(layouts, {})[0], sort_keys=True)
        self.assertEqual(first, second)
        # No wall-clock time: the SWAT+ release stands in for "generated on".
        self.assertEqual(build(layouts, {})[0]["source"]["generated_on"], "62.0.0")

    def test_type_mapping(self):
        self.assertEqual(g.field_type("integer"), "IntegerField")
        self.assertEqual(g.field_type("real"), "DoubleField")
        self.assertEqual(g.field_type("character(len=40)"), "CharField")
        self.assertEqual(g.field_type("logical"), "BooleanField")
        self.assertEqual(g.field_type(None), "CharField")


if __name__ == "__main__":
    unittest.main()
