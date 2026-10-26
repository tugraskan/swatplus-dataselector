#!/usr/bin/env python3
"""Unit tests for hru_processor.py (HRU subsets and the tracked SWAT+ workarounds).

The fixtures are a tiny SWAT+ dataset written to a temp folder: three subbasins
A, B and C, each with an upland HRU, a riparian wetland HRU and two routing
units laid out like the 02070009 dataset:

    ru1_x  routes only to its pond, its riparian HRU and its aquifer; it reaches
           the channels only as an element (OBJ_TYP ru) of ru2_x.
    ru2_x  elements: riparian HRU, pond, ru1_x; routes to the channels of x.

    channels  1 -> 2 -> 3 -> 4 -> 5 -> 6 -> outlet   (A: 1,2  B: 3,4  C: 5,6)

Run from this folder with:  python3 -m unittest test_hru_processor
"""

import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hru_processor as hp  # noqa: E402

CON_HEAD = "ID NAME GIS_ID AREA LAT LON ELEV {props} WST CST OVFL RULE OUT_TOT obj_typ1 obj_id1 hyd_typ1 frac1"

FILE_CIO = [
    "file_cio test",
    "           SIMULATION             time.sim            print.prt           object.prt           object.cnt      constituents.cs",
    "                BASIN            codes.bsn       parameters.bsn    null",
    "              CONNECT              hru.con          hru-lte.con        rout_unit.con           gwflow.con          aquifer.con        aquifer2d.con          channel.con        reservoir.con           recall.con             exco.con         delratio.con           outlet.con          chandeg.con",
    "              CHANNEL          initial.cha          channel.cha        hydrology.cha         sediment.cha        nutrients.cha      channel-lte.cha      hyd-sed-lte.cha      temperature.cha",
    "            RESERVOIR          initial.res        reservoir.res        hydrology.res         sediment.res        nutrients.res             weir.res          wetland.wet        hydrology.wet",
    "            ROUT_UNIT        rout_unit.def        rout_unit.ele        rout_unit.rtu         rout_unit.dr",
    "                  HRU         hru-data.hru          hru-lte.hru",
    "               RECALL           recall.rec",
    "         WATER_RIGHTS          pou_ex1.wal          pod_ex1.wal                 null",
    "                 LINK        chan-surf.lin          aqu_cha.lin",
    "              REGIONS          ls_unit.ele          ls_unit.def           ls_reg.ele           ls_reg.def           ls_cal.reg       ch_catunit.ele       ch_catunit.def           ch_reg.def      aqu_catunit.ele      aqu_catunit.def          aqu_reg.def      res_catunit.ele      res_catunit.def          res_reg.def      rec_catunit.ele      rec_catunit.def          rec_reg.def",
]

PRINT_PRT = [
    "print test",
    " N_Yrs_SKIP   JD_START  YRC_START     JD_END    YRC_END   INTERVAL",
    "      0          0          0          0          0          1",
    " aa_int_cnt",
    "          0",
    " CSVOUT DBOUT CDFOUT",
    "      n     y      n",
    "CROPYLD MGTOUT HYDCON FDCOUT",
    "    a     n    n      y",
    "       OBJECTS     DAILY   MONTHLY    YEARLY     AVANN",
    "      basin_wb         n         y         y         y",
    "  basin_sed_bud         n         n         n         y",
    "     lsunit_wb         n         n         y         y",
    "        hru_wb         y         n         y         y",
    "    channel_sd         n         n         y         y",
]


def con_row(obj_id, name, props, targets):
    parts = [str(obj_id), name, "1", "10.0", "40.0", "-80.0", "100", str(props), "wst", "0", "0", "0", str(len(targets))]
    for typ, target_id, frac in targets:
        parts += [typ, str(target_id), "tot", str(frac)]
    return " ".join(parts)


def write_lines(path, lines, eol="\r\n"):
    with open(path, "w", newline="") as handle:
        handle.write("".join(line + eol for line in lines))


def read_lines(path):
    with open(path, newline="") as handle:
        return handle.read().replace("\r\n", "\n").rstrip("\n").split("\n")


def data_rows(path, header_lines=2):
    return [line.split() for line in read_lines(path)[header_lines:] if line.strip()]


def build_dataset(root, hydrology_rows=None):
    """Write the three-subbasin fixture to root and return it."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    w = lambda name, lines: write_lines(root / name, lines)  # noqa: E731

    w("file.cio", FILE_CIO)
    w("print.prt", PRINT_PRT)
    w("null", [])

    # HRUs: 1 up A, 2 rip A, 3 up B, 4 rip B, 5 up C, 6 rip C. The riparian HRUs hold wetlands.
    w("hru.con", ["hru_con test", CON_HEAD.format(props="HRU").split(" obj_typ1")[0]]
      + [con_row(i, f"hru{i}", i, []) for i in range(1, 7)])
    stores = {1: "null", 2: "wet_A", 3: "null", 4: "wet_B", 5: "null", 6: "wet_C"}
    w("hru-data.hru", ["hru_dat test", "ID NAME TOPO HYDRO SOIL LU_MGT SOIL_INI SURF_STOR SNOW FIELD"]
      + [f"{i} hd{i} topo hyd soil lum ini {stores[i]} snow1 field1" for i in range(1, 7)])

    w("rout_unit.con", ["rout_con test", CON_HEAD.format(props="RTU")]
      + [
          con_row(1, "ru1_A", 1, [("res", 1, 1), ("hru", 2, 1), ("aqu", 1, 1)]),
          con_row(2, "ru2_A", 2, [("sdc", 1, 0.5), ("sdc", 2, 0.5), ("aqu", 1, 1)]),
          con_row(3, "ru1_B", 3, [("res", 2, 1), ("hru", 4, 1), ("aqu", 2, 1)]),
          con_row(4, "ru2_B", 4, [("sdc", 3, 0.5), ("sdc", 4, 0.5), ("aqu", 2, 1)]),
          con_row(5, "ru1_C", 5, [("res", 3, 1), ("hru", 6, 1), ("aqu", 3, 1)]),
          con_row(6, "ru2_C", 6, [("sdc", 5, 0.5), ("sdc", 6, 0.5), ("aqu", 3, 1)]),
      ])
    w("rout_unit.ele", ["rtu_ele test", "ID NAME OBJ_TYP OBJ_TYP_NO FRAC DEL",
                        "1 e1 hru 1 0.5 1", "2 e2 hru 2 0.5 1", "3 e3 res 1 0.5 1", "4 e4 ru 1 0.5 1",
                        "5 e5 hru 3 0.5 1", "6 e6 hru 4 0.5 1", "7 e7 res 2 0.5 1", "8 e8 ru 3 0.5 1",
                        "9 e9 hru 5 0.5 1", "10 e10 hru 6 0.5 1", "11 e11 res 3 0.5 1", "12 e12 ru 5 0.5 1"])
    w("rout_unit.def", ["rtu_def test", "ID NAME ELEM_TOT elem1 elem2",
                        "1 ru1_A 1 1", "2 ru2_A 2 2 -4", "3 ru1_B 1 5", "4 ru2_B 2 6 -8",
                        "5 ru1_C 1 9", "6 ru2_C 2 10 -12"])
    w("rout_unit.rtu", ["rtu_dat test", "ID NAME DEF DEL TOPO FLD"]
      + [f"{i} ru_{i} {i} 0 ru_{i} 0" for i in range(1, 7)])

    chain = {1: [("sdc", 2, 1)], 2: [("sdc", 3, 1)], 3: [("sdc", 4, 1)], 4: [("sdc", 5, 1)],
             5: [("sdc", 6, 1)], 6: [("out", 1, 1)]}
    w("chandeg.con", ["lcha_con test", CON_HEAD.format(props="LCHA")]
      + [con_row(i, f"ch{i}", i, chain[i]) for i in range(1, 7)])
    w("channel-lte.cha", ["lcha_dat test", "ID NAME CHA_INI CHA_HYD CHA_SED CHA_NUT"]
      + [f"{i} ch{i} ini hyd null nut" for i in range(1, 7)])
    w("aquifer.con", ["aqu_con test", CON_HEAD.format(props="AQU")]
      + [con_row(i, f"aq{i}", i, []) for i in range(1, 4)])
    w("aquifer.aqu", ["aqu_dat test", "ID NAME AQU_INI GW_FLO"] + [f"{i} aq{i} default 0.05" for i in range(1, 4)])
    w("reservoir.con", ["res_con test", CON_HEAD.format(props="RES")]
      + [con_row(i, f"pnd{i}", i, [("aqu", i, 1)]) for i in range(1, 4)])
    w("reservoir.res", ["res_dat test", "ID NAME INIT HYD REL SED NUT"]
      + [f"{i} pnd{i} pond hyd rel sed nut" for i in range(1, 4)])
    w("outlet.con", ["out_con test", CON_HEAD.format(props="OUT"), con_row(1, "out1", 1, [])])

    w("object.cnt", [
        "obj_cnt test",
        "NAME LS_AREA TOT_AREA OBJ HRU LHRU RTU GWFL AQU CHA RES REC EXCO DEL CAN PMP OUT LCHA AQU2D HRD WRO",
        "fixture 100 100 22 6 0 6 0 3 0 3 0 0 0 0 0 1 6 0 0 0",
    ])
    w("aqu_cha.lin", ["aqu_cha test", "NUMB NAME ELEM_CNT elem1 elem2",
                      "           1  aq1           2      1    -2",
                      "           2  aq2           2      3    -4",
                      "           3  aq3           2      5    -6"])
    w("chan-surf.lin", ["chan_surf test", "2", "ID NAME NSPU obj_typ obj_no",
                        "1 ch1 2 hru 2 ru 2", "6 ch6 1 hru 6"])

    w("ls_unit.ele", ["lsu_ele test", "ID NAME OBJ_TYP OBJ_TYP_NO BSN_FRAC RU_FRAC"]
      + [f"{i} hru{i} hru {i} 0.1 0.1" for i in range(1, 7)])
    w("ls_unit.def", ["lsu_def test", "3", "LSU_NUMB LSU_NAME AREA ELEM_TOT elem1 elem2",
                      "1 sub_A 10 2 1 -2", "2 sub_B 10 2 3 -4", "3 sub_C 10 2 5 -6"])

    w("wetland.wet", ["wet_dat test", "NUMB_STEPS NAME INIT HYD REL SED NUT",
                      "1 wet_A wet_init hyd_A wetland wetland wetland",
                      "1 wet_B wet_init hyd_B wetland wetland wetland",
                      "1 wet_C wet_init hyd_C wetland wetland wetland",
                      "1 wet_D wet_init hyd_D wetland wetland wetland"])
    w("hydrology.wet", ["hyd_wet test", "NAME HRU_PS DP_PS HRU_ES DP_ES K EVAP"]
      + (hydrology_rows or [f"hyd_{x} 0.8 1200 1 1300 0.01 {evap}"
                            for x, evap in zip("ABCD", ("0.5", "0.6", "0.7", "0.8"))]))

    # REGIONS files that carry aquifer numbers.
    w("aqu_catunit.ele", ["aqu_ele test", "ID NAME OBJ_TYP OBJ_TYP_NO",
                          "1 aq1 aqu 1", "2 aq2 aqu 2", "3 aq3 aqu 3"])
    w("aqu_catunit.def", ["aqu_def test", "2", "ID NAME AREA ELEM_TOT elem1 elem2",
                          "1 grpAB 100 2 1 -2", "2 grpC 50 1 3"])
    w("aqu_reg.def", ["aqu_reg test", "1", "ID NAME AREA ELEM_TOT elem1", "1 reg 150 1 1"])
    for name in ("ls_reg.ele", "ch_catunit.ele"):
        w(name, ["ele test", "ID NAME OBJ_TYP OBJ_TYP_NO"])
    return root


def quiet(func, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return func(*args, **kwargs)


class TempDirTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.src = build_dataset(self.tmp / "src")

    def subset(self, hru_ids, **options):
        out = self.tmp / f"out_{len(list(self.tmp.iterdir()))}"
        result = quiet(hp.process_hru_subset, str(self.src), hru_ids, output_dir=str(out), **options)
        return Path(result["output_dir"]), result


class TokenTests(unittest.TestCase):
    def test_expand_and_compress_round_trip(self):
        self.assertEqual(hp.expand_element_tokens(["1", "-3", "7", "9", "-10"]), [1, 2, 3, 7, 9, 10])
        self.assertEqual(hp.compress_element_ids([1, 2, 3, 7, 9, 10, 12]), ["1", "-3", "7", "9", "-10", "12"])
        self.assertEqual(hp.compress_element_ids([]), [])
        ids = [2, 3, 4, 8, 20, 21]
        self.assertEqual(hp.expand_element_tokens(hp.compress_element_ids(ids)), ids)

    def test_replace_token_keeps_the_columns(self):
        self.assertEqual(hp.replace_token("  a    10   c", 1, "7"), "  a     7   c")
        self.assertEqual(hp.replace_token("a b", 5, "x"), "a b")


class AquChaLinTests(TempDirTest):
    def test_keep_routing_keeps_only_retained_aquifers_renumbered(self):
        # HRU 3 (upland B) keeps subbasins B and C (feeder HRU 6): aquifers 2 and 3, channels 3-6.
        out, result = self.subset([3], keep_routing=True)
        self.assertEqual(result["id_maps"]["aqu"], {"2": 1, "3": 2})
        self.assertEqual(result["id_maps"]["sdc"], {"3": 1, "4": 2, "5": 3, "6": 4})
        lines = read_lines(out / "aqu_cha.lin")
        self.assertEqual(lines[:2], ["aqu_cha test", "NUMB NAME ELEM_CNT elem1 elem2"])
        rows = [line.split() for line in lines[2:]]
        self.assertEqual(rows, [["1", "aq2", "2", "1", "-2"], ["2", "aq3", "2", "3", "-4"]])
        # SWAT+ allocates aq_ch(sp_ob%aqu) and writes aq_ch(id): no id may exceed the aquifer count.
        self.assertLessEqual(max(int(row[0]) for row in rows), len(result["id_maps"]["aqu"]))

    def test_channels_that_were_not_kept_are_dropped_and_runs_recompressed(self):
        self.src.joinpath("aqu_cha.lin").write_bytes(b"")
        write_lines(self.src / "aqu_cha.lin", [
            "aqu_cha test", "NUMB NAME ELEM_CNT elem1 elem2",
            "1 aq1 2 1 -2", "2 aq2 4 3 -3 5 -6", "3 aq3 2 4 -6",
        ])
        out, result = self.subset([3], keep_routing=True)
        rows = [line.split() for line in read_lines(out / "aqu_cha.lin")[2:]]
        # aq2 had channels 3,5,6 -> kept ids 1,3,4 ; aq3 had 4,5,6 -> 2,3,4
        self.assertEqual(rows[0], ["1", "aq2", "3", "1", "3", "-4"])
        self.assertEqual(rows[1], ["2", "aq3", "2", "2", "-4"])

    def test_preserves_crlf(self):
        out, _ = self.subset([3], keep_routing=True)
        raw = (out / "aqu_cha.lin").read_bytes()
        self.assertIn(b"\r\n", raw)
        self.assertNotIn(b"\n", raw.replace(b"\r\n", b""))


class RoutingUnitElementTracingTests(TempDirTest):
    def trace(self, hru_ids, **kwargs):
        tracer = hp.RoutingTracer(self.tmp / "work", **kwargs)
        build_dataset(self.tmp / "work")
        keep, _ = quiet(tracer.trace_and_filter, hru_ids)
        return keep, tracer

    def test_upland_hru_alone_reaches_the_channels_through_the_unit_that_lists_its_unit(self):
        keep, _ = self.trace([1], add_feeder_hrus=False)
        self.assertEqual(keep["ru"], {1, 2})
        self.assertEqual(keep["sdc"], {1, 2, 3, 4, 5, 6})
        self.assertEqual(keep["hru"], {1, 2})  # 2 is routed to by ru1_A
        self.assertEqual(keep["aqu"], {1})
        self.assertEqual(keep["out"], {1})

    def test_without_the_element_edge_the_upland_unit_would_reach_no_channel(self):
        work = self.tmp / "work"
        build_dataset(work)
        tracer = hp.RoutingTracer(work, add_feeder_hrus=False)
        tracer._load_graph()
        graph = {node: [t for t in targets if t[2] != hp.MEMBERSHIP_EDGE] for node, targets in tracer._graph.items()}
        reached = {("hru", 1)}
        stack = [("hru", 1)]
        while stack:
            for typ, obj_id, _, _ in graph.get(stack.pop(), []):
                if (typ, obj_id) not in reached:
                    reached.add((typ, obj_id))
                    stack.append((typ, obj_id))
        self.assertFalse(any(typ == "sdc" for typ, _ in reached))

    def test_unit_with_no_kept_element_is_left_out(self):
        work = self.tmp / "work"
        build_dataset(work)
        # A unit that is only a con-file target and has no element in the subset.
        lines = read_lines(work / "rout_unit.con")
        lines.append(con_row(7, "ru_orphan", 7, []))
        lines[lines.index(next(l for l in lines if l.startswith("1 ru1_A")))] = con_row(
            1, "ru1_A", 1, [("res", 1, 1), ("hru", 2, 1), ("aqu", 1, 1), ("ru", 7, 1)])
        write_lines(work / "rout_unit.con", lines)
        write_lines(work / "rout_unit.def", read_lines(work / "rout_unit.def") + ["7 ru_orphan 1 99"])
        tracer = hp.RoutingTracer(work, add_feeder_hrus=False)
        keep, _ = quiet(tracer.trace_and_filter, [1])
        self.assertNotIn(7, keep["ru"])


class FeederHruTests(TempDirTest):
    def test_adds_one_hru_per_channel_that_would_have_only_channel_inflows(self):
        out, result = self.subset([1], keep_routing=True)
        added = [item["hru_id"] for item in result["added_hru_ids"]]
        # ch3 (first channel of B) and then ch5 (first channel of C) get a routing-unit inflow.
        self.assertEqual(added, [4, 6])
        for item in result["added_hru_ids"]:
            self.assertIn("only channel inflows", item["reason"])
        self.assertEqual(sorted(result["id_maps"]["hru"], key=int), ["1", "2", "4", "6"])
        self.assertIn("W1", result["workarounds_applied"])

    def test_every_kept_channel_gets_a_non_channel_inflow(self):
        out, result = self.subset([1], keep_routing=True)
        tracer = hp.RoutingTracer(out)
        tracer._load_graph()
        keep = {typ: set(range(1, len(ids) + 1)) for typ, ids in result["id_maps"].items()}
        self.assertEqual(tracer._channel_only_channels(keep), [])

    def test_exact_hrus_turns_it_off(self):
        out, result = self.subset([1], keep_routing=True, exact_hrus=True)
        self.assertEqual(result["added_hru_ids"], [])
        self.assertNotIn("W1", result["workarounds_applied"])
        self.assertEqual(sorted(result["id_maps"]["hru"], key=int), ["1", "2"])
        # the first inflow of channel 3 is channel 2: the crash case of SWAT+ ch_temp
        tracer = hp.RoutingTracer(self.src, add_feeder_hrus=False)
        tracer._load_graph()
        keep = tracer._compute_keep([1])
        self.assertIn(3, tracer._channel_only_channels(keep))

    def test_feeder_is_taken_from_the_full_dataset_not_the_subset(self):
        tracer = hp.RoutingTracer(self.src)
        tracer._load_graph()
        self.assertEqual(tracer._feeders_of_channel(3), [("ru", 4)])
        self.assertEqual(tracer._hru_of_routing_unit(4), 4)

    def test_hru_ids_that_do_not_exist_are_reported(self):
        with self.assertRaisesRegex(ValueError, "not found in hru.con"):
            self.subset([99], keep_routing=True)


def wet_hyd_for_kept_hrus(out):
    """Emulate wet_initial and et_act on a subset folder.

    wet_initial.f90 fills wet_hyd(iihru) with the hydrology of HRU iihru's wetland and stores the
    hydrology.wet row in wet_dat%hyd; et_act.f90 reads wet_hyd(row). Returns, for each wetland HRU,
    (row, row <= number of HRUs, hydrology EVAP that et_act would use, EVAP of the wetland's own).
    """
    hru_count = len(data_rows(out / "hru.con"))
    props = {int(r[0]): int(r[7]) for r in data_rows(out / "hru.con")}
    stores = {int(r[0]): r[7] for r in data_rows(out / "hru-data.hru")}
    hyd_of_store = {r[1]: r[3] for r in data_rows(out / "wetland.wet")}
    rows = data_rows(out / "hydrology.wet")
    evap = {r[0]: r[6] for r in rows}
    wet_hyd = {}
    for hru_id, prop in props.items():
        store = stores[prop]
        if store != "null":
            wet_hyd[hru_id] = evap[hyd_of_store[store]]
    found = {}
    for hru_id, prop in props.items():
        store = stores[prop]
        if store == "null":
            continue
        row = next(i for i, r in enumerate(rows, start=1) if r[0] == hyd_of_store[store])
        found[hru_id] = (row, row <= hru_count, wet_hyd.get(row, "default"), evap[hyd_of_store[store]])
    return found


class HydrologyWetTests(TempDirTest):
    def assert_et_act_reads_each_wetlands_own_row(self, out):
        found = wet_hyd_for_kept_hrus(out)
        self.assertTrue(found)
        for hru_id, (row, inside, used, own) in found.items():
            self.assertTrue(inside, f"HRU {hru_id}: row {row} is past the HRU count")
            self.assertEqual(used, own, f"HRU {hru_id}: et_act would read another HRU's hydrology")

    def test_each_wetland_row_sits_at_the_number_of_the_hru_that_uses_it(self):
        # keeps HRUs 1,2,4,6 -> new 1..4; wetlands on new HRUs 2,3,4 use hyd_A, hyd_B, hyd_C
        out, result = self.subset([1], keep_routing=True)
        names = [row[0] for row in data_rows(out / "hydrology.wet")]
        self.assertEqual(names, ["unused_row_1", "hyd_A", "hyd_B", "hyd_C"])
        self.assertIn("W2", result["workarounds_applied"])
        self.assertLessEqual(len(names), len(result["id_maps"]["hru"]))
        self.assert_et_act_reads_each_wetlands_own_row(out)

    def test_the_old_compaction_read_another_hrus_entry(self):
        # Rows kept in their original order, no gaps: HRU 2 (wet_A, row 1) would read wet_hyd(1),
        # the entry of upland HRU 1.
        out, _ = self.subset([1], keep_routing=True, keep_wetland_file=True)
        write_lines(out / "hydrology.wet", read_lines(out / "hydrology.wet")[:2]
                    + [line for line in read_lines(self.src / "hydrology.wet")[2:] if "hyd_D" not in line])
        found = wet_hyd_for_kept_hrus(out)
        self.assertEqual(found[2][2], "default")
        self.assertNotEqual(found[2][2], found[2][3])

    def test_placeholder_rows_are_copies_with_a_name_no_wetland_uses(self):
        out, _ = self.subset([1], keep_routing=True)
        rows = data_rows(out / "hydrology.wet")
        wetland_hyds = {row[3] for row in data_rows(out / "wetland.wet")}
        self.assertNotIn(rows[0][0], wetland_hyds)
        self.assertEqual(rows[0][1:], rows[1][1:])  # values of the first real row, not zeros

    def test_isolate_mode_aligns_too(self):
        out, result = self.subset([4, 6])
        self.assertEqual([row[0] for row in data_rows(out / "hydrology.wet")], ["hyd_B", "hyd_C"])
        self.assertEqual(result["workarounds_applied"], ["W2"])
        self.assert_et_act_reads_each_wetlands_own_row(out)

    def test_a_late_wetland_file_row_comes_down_to_the_hru_number(self):
        out, result = self.subset([6])  # one HRU; its wetland is row 3 of 4 in the full file
        self.assertEqual([row[0] for row in data_rows(out / "hydrology.wet")], ["hyd_C"])
        self.assert_et_act_reads_each_wetlands_own_row(out)

    def test_wetlands_that_share_a_hydrology_row_read_the_same_row(self):
        wet = read_lines(self.src / "wetland.wet")
        wet[4] = wet[4].replace("hyd_C", "hyd_A")  # wet_C now uses hyd_A as well
        write_lines(self.src / "wetland.wet", wet)
        out, _ = self.subset([1], keep_routing=True)  # wetlands on new HRUs 2,3,4: hyd_A, hyd_B, hyd_A
        self.assertEqual([row[0] for row in data_rows(out / "hydrology.wet")], ["unused_row_1", "hyd_A", "hyd_B"])
        self.assert_et_act_reads_each_wetlands_own_row(out)

    def test_never_more_rows_than_hrus(self):
        for hru_ids in ([1], [3], [2, 6], [1, 3, 5]):
            out, result = self.subset(hru_ids, keep_routing=True)
            self.assertLessEqual(len(data_rows(out / "hydrology.wet")), len(result["id_maps"]["hru"]), hru_ids)

    def test_running_it_again_changes_nothing(self):
        out, _ = self.subset([1], keep_routing=True)
        before = read_lines(out / "hydrology.wet")
        again = quiet(hp.compact_hydrology_wet, out)
        self.assertEqual(again["changed"], 0)
        self.assertEqual(read_lines(out / "hydrology.wet"), before)

    def test_keep_wetland_file_leaves_the_file_alone(self):
        before = read_lines(self.src / "hydrology.wet")
        out, result = self.subset([1], keep_routing=True, keep_wetland_file=True)
        self.assertEqual(read_lines(out / "hydrology.wet"), before)
        self.assertNotIn("W2", result["workarounds_applied"])

    def test_no_wetland_kept_leaves_the_file_alone(self):
        out, result = self.subset([1, 3])  # uplands only
        self.assertEqual(len(data_rows(out / "hydrology.wet")), 4)
        self.assertNotIn("W2", result["workarounds_applied"])


class MainCompatTests(TempDirTest):
    def test_water_rights_null_null_null_and_empty_null_file(self):
        (self.src / "null").unlink()
        out, result = self.subset([1], keep_routing=True, main_compat=True)
        rights = next(line for line in read_lines(out / "file.cio") if "WATER_RIGHTS" in line)
        self.assertEqual(rights.split(), ["WATER_RIGHTS", "null", "null", "null"])
        self.assertTrue((out / "null").is_file())
        self.assertEqual((out / "null").stat().st_size, 0)
        self.assertIn("W3", result["workarounds_applied"])

    def test_removes_the_nam_only_print_rows_and_leaves_the_rest(self):
        out, _ = self.subset([1], keep_routing=True, main_compat=True)
        names = [row[0] for row in data_rows(out / "print.prt", header_lines=10)]
        self.assertNotIn("basin_sed_bud", names)
        self.assertEqual(names, ["basin_wb", "lsunit_wb", "hru_wb", "channel_sd"])

    def test_off_by_default(self):
        out, result = self.subset([1], keep_routing=True)
        rights = next(line for line in read_lines(out / "file.cio") if "WATER_RIGHTS" in line)
        self.assertEqual(rights.split()[1], "pou_ex1.wal")
        self.assertIn("basin_sed_bud", [row[0] for row in data_rows(out / "print.prt", header_lines=10)])
        self.assertNotIn("W3", result["workarounds_applied"])

    def test_isolate_mode_supports_it_too(self):
        out, result = self.subset([1], main_compat=True)
        self.assertIn("W3", result["workarounds_applied"])
        self.assertNotIn("basin_sed_bud", [row[0] for row in data_rows(out / "print.prt", header_lines=10)])


class NoOutputsTests(TempDirTest):
    def test_all_flags_of_every_object_row_are_n_and_the_layout_is_kept(self):
        out, result = self.subset([1], keep_routing=True, no_outputs=True)
        lines = read_lines(out / "print.prt")
        start = next(i for i, line in enumerate(lines) if line.split()[:1] == ["OBJECTS"])
        for line in lines[start + 1:]:
            self.assertEqual(line.split()[1:], ["n", "n", "n", "n"], line)
        # rows above the OBJECTS header (CSVOUT/CROPYLD settings) are untouched
        self.assertEqual(lines[:start], hp.read_text_lines(self.src / "print.prt")[0][:start])
        self.assertEqual(len(lines[start + 1]), len(PRINT_PRT[start + 1]))
        self.assertEqual(result["workarounds_applied"].count("W4"), 1)

    def test_independent_of_main_compat(self):
        out, result = self.subset([1], keep_routing=True, no_outputs=True)
        self.assertIn("basin_sed_bud", [row[0] for row in data_rows(out / "print.prt", header_lines=10)])
        self.assertNotIn("W3", result["workarounds_applied"])

    def test_with_main_compat_the_nam_only_rows_are_gone_and_the_rest_are_off(self):
        out, result = self.subset([1], keep_routing=True, main_compat=True, no_outputs=True)
        rows = data_rows(out / "print.prt", header_lines=10)
        self.assertNotIn("basin_sed_bud", [row[0] for row in rows])
        self.assertTrue(all(row[1:] == ["n"] * 4 for row in rows))
        self.assertEqual(result["workarounds_applied"][-2:], ["W3", "W4"])


class LinkAndRegionFileTests(TempDirTest):
    def test_aquifer_region_files_are_renumbered_with_the_aquifer_map(self):
        out, result = self.subset([3], keep_routing=True)  # aquifers 2,3 kept -> 1,2
        self.assertEqual(data_rows(out / "aqu_catunit.ele"), [["1", "aq2", "aqu", "1"], ["2", "aq3", "aqu", "2"]])
        lines = read_lines(out / "aqu_catunit.def")
        self.assertEqual(lines[1], "2")
        self.assertEqual([line.split() for line in lines[3:]], [
            ["1", "grpAB", "100", "1", "1"],
            ["2", "grpC", "50", "1", "2"],
        ])

    def test_region_files_that_cannot_be_renumbered_are_nulled_in_file_cio(self):
        out, _ = self.subset([3], keep_routing=True)
        cio = "\n".join(read_lines(out / "file.cio"))
        self.assertNotIn("aqu_reg.def", cio)
        self.assertIn("aqu_catunit.ele", cio)

    def test_empty_region_files_are_left_alone(self):
        out, _ = self.subset([3], keep_routing=True)
        cio = "\n".join(read_lines(out / "file.cio"))
        self.assertIn("ls_reg.ele", cio)
        self.assertIn("ch_catunit.ele", cio)

    def test_chan_surf_lin_follows_the_channel_and_object_maps(self):
        out, result = self.subset([1], keep_routing=True)  # channels 1..6 and HRUs 1,2,4,6 -> 1..4
        lines = read_lines(out / "chan-surf.lin")
        self.assertEqual(lines[1], "2")
        self.assertEqual([line.split() for line in lines[3:]], [
            ["1", "ch1", "2", "hru", "2", "ru", "2"],
            ["6", "ch6", "1", "hru", "4"],
        ])

    def test_chan_surf_lin_has_no_rows_in_an_isolated_subset(self):
        out, _ = self.subset([2, 6])
        lines = read_lines(out / "chan-surf.lin")
        self.assertEqual(lines[1], "0")
        self.assertEqual(len(lines), 3)

    def test_rout_unit_rtu_def_column_follows_the_unit_renumbering(self):
        out, result = self.subset([3], keep_routing=True)
        ru_map = {int(k): v for k, v in result["id_maps"]["ru"].items()}
        rows = data_rows(out / "rout_unit.rtu")
        self.assertEqual([int(row[0]) for row in rows], sorted(ru_map.values()))
        for row in rows:
            self.assertEqual(row[0], row[2], row)  # DEF names the row of rout_unit.def with the same number

    def test_isolate_mode_rtu_def_column(self):
        out, _ = self.subset([4, 6])
        for row in data_rows(out / "rout_unit.rtu"):
            self.assertEqual(row[0], row[2], row)

    def test_landscape_region_elements_follow_the_landscape_unit_map(self):
        write_lines(self.src / "ls_reg.ele", ["t", "ID NAME OBJ_TYP OBJ_TYP_NO",
                                              "1 a lsu 1", "2 b lsu 2", "3 c lsu 3"])
        out, _ = self.subset([4, 6])  # ls_unit.def keeps sub_B and sub_C as units 1 and 2
        self.assertEqual([row[2:] for row in data_rows(out / "ls_reg.ele")], [["lsu", "1"], ["lsu", "2"]])

    def test_region_element_file_filter_and_def_drop(self):
        path = self.tmp / "x.ele"
        write_lines(path, ["t", "ID NAME OBJ_TYP OBJ_TYP_NO", "1 a sdc 5", "2 b cha 7", "3 c chandeg 9", "4 d hru 1"])
        elem_map = hp.renumber_unit_element_file(path, {"sdc": {5: 1, 9: 2}, "hru": {1: 1}})
        self.assertEqual(elem_map, {1: 1, 3: 2, 4: 3})
        self.assertEqual([r[2:] for r in data_rows(path)], [["sdc", "1"], ["chandeg", "2"], ["hru", "1"]])


class RegistryTests(TempDirTest):
    def test_registry_has_w1_to_w4_with_the_required_fields(self):
        self.assertEqual(hp.workaround_ids(), ["W1", "W2", "W3", "W4"])
        for entry in hp.SWAT_WORKAROUNDS:
            for key in ("id", "title", "flag", "default", "tool_does", "bugs", "remove_when"):
                self.assertIn(key, entry)
            for bug in entry["bugs"]:
                for key in ("summary", "file", "pattern", "locations"):
                    self.assertIn(key, bug)
                re.compile(bug["pattern"])
        self.assertEqual(hp.SWAT_BRANCH_COMMITS, {"NAM_Branch": "6efcee0", "main": "6f51536", "dev": "16ea369"})
        self.assertEqual([k["id"] for k in hp.SWAT_KNOWN_BUGS], ["K1", "K2"])

    def test_flags_exist_on_the_command_line(self):
        parser = hp.build_parser()
        known = {action.option_strings[-1] for action in parser._actions if action.option_strings}
        for entry in hp.SWAT_WORKAROUNDS:
            self.assertIn(entry["flag"], known)

    def test_markdown_file_matches_the_registry(self):
        doc = Path(hp.__file__).with_name("SWAT_WORKAROUNDS.md").read_text(encoding="utf-8")
        self.assertEqual(doc.replace("\r\n", "\n"), hp.render_workarounds_markdown())
        for entry in hp.SWAT_WORKAROUNDS:
            self.assertIn(f"## {entry['id']} - ", doc)

    def test_json_result_reports_applied_workarounds_and_added_hrus(self):
        out, result = self.subset([1], keep_routing=True, main_compat=True, no_outputs=True)
        self.assertEqual(result["workarounds_applied"], ["W1", "W2", "W3", "W4"])
        self.assertEqual([item["hru_id"] for item in result["added_hru_ids"]], [4, 6])
        self.assertEqual(result["options"], {
            "exact_hrus": False, "keep_wetland_file": False, "main_compat": True, "no_outputs": True})
        json.dumps(result)  # serialisable

    def test_plain_isolate_run_reports_only_what_changed(self):
        out, result = self.subset([1, 3])
        self.assertEqual(result["workarounds_applied"], [])
        self.assertEqual(result["added_hru_ids"], [])

    def test_cli_json_includes_the_new_fields(self):
        out = self.tmp / "cli_out"
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(io.StringIO()):
            code = hp.main(["--dataset", str(self.src), "--hru-ids", "1", "--keep-routing", "--exact-hrus",
                            "--main-compat", "--output-dir", str(out), "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(buffer.getvalue())
        self.assertEqual(payload["workarounds_applied"], ["W2", "W3"])
        self.assertEqual(payload["added_hru_ids"], [])


def tree_fingerprint(root):
    """Every file under root with its size and modification time: proves a folder was only read."""
    return sorted(
        (str(path.relative_to(root)), path.stat().st_size, path.stat().st_mtime_ns)
        for path in Path(root).rglob("*") if path.is_file()
    )


def run_cli(*argv):
    """hp.main(argv) -> (exit code, stdout text)."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(io.StringIO()):
        code = hp.main(list(argv))
    return code, buffer.getvalue()


class PlanTests(TempDirTest):
    """--plan reports what a run would do, and a real run then does exactly that."""

    SELECTIONS = [
        ([1], dict(keep_routing=True)),
        ([3], dict(keep_routing=True)),
        ([1, 5], dict(keep_routing=True)),
        ([1], dict(keep_routing=True, exact_hrus=True)),
        ([2, 4], dict(keep_routing=True, keep_wetland_file=True)),
        ([1, 3], dict()),
        ([2, 4, 6], dict()),
        ([1, 2, 3, 4, 5, 6], dict(keep_routing=True, main_compat=True, no_outputs=True)),
    ]

    def test_plan_matches_the_real_run(self):
        for hru_ids, options in self.SELECTIONS:
            with self.subTest(hru_ids=hru_ids, options=options):
                plan = quiet(hp.plan_hru_subset, str(self.src), hru_ids, **options)
                _, real = self.subset(hru_ids, **options)
                for key in ("retained_counts", "added_hru_ids", "workarounds_applied", "warnings", "hru_ids",
                            "keep_routing", "options", "source_dir"):
                    self.assertEqual(plan[key], real[key], key)

    def test_plan_changes_nothing_and_never_makes_the_output_folder(self):
        out = self.tmp / "never_made"
        before = tree_fingerprint(self.tmp)
        code, text = run_cli("--dataset", str(self.src), "--hru-ids", "1", "--keep-routing", "--plan",
                             "--output-dir", str(out), "--json")
        self.assertEqual(code, 0)
        self.assertFalse(out.exists())
        self.assertEqual(tree_fingerprint(self.tmp), before)
        payload = json.loads(text)
        self.assertTrue(payload["ok"] and payload["plan"])
        self.assertNotIn("output_dir", payload)
        self.assertEqual([item["hru_id"] for item in payload["added_hru_ids"]], [4, 6])
        self.assertEqual(payload["retained_counts"]["hru"], 4)
        self.assertEqual(payload["workarounds_applied"], ["W1", "W2"])

    def test_plan_without_keep_routing_counts_only_hrus_and_still_decides_w2(self):
        plan = quiet(hp.plan_hru_subset, str(self.src), [2, 4])
        self.assertEqual(plan["retained_counts"], {"hru": 2})
        self.assertEqual(plan["added_hru_ids"], [])
        self.assertEqual(plan["workarounds_applied"], ["W2"])  # hydrology.wet shrinks to the two kept wetlands
        # Already aligned: the wetlands of new HRUs 1-3 use the first three rows, and there are only three.
        aligned = build_dataset(self.tmp / "aligned", hydrology_rows=[
            f"hyd_{x} 0.8 1200 1 1300 0.01 {evap}" for x, evap in zip("ABC", ("0.5", "0.6", "0.7"))])
        plan = quiet(hp.plan_hru_subset, str(aligned), [2, 4, 6])
        self.assertEqual(plan["workarounds_applied"], [])

    def test_plan_reports_main_compat_and_no_outputs(self):
        plan = quiet(hp.plan_hru_subset, str(self.src), [1], main_compat=True, no_outputs=True)
        self.assertEqual(plan["workarounds_applied"], ["W3", "W4"])

    def test_exact_hrus_warns_about_channels_with_only_channel_inflows(self):
        plan = quiet(hp.plan_hru_subset, str(self.src), [1], keep_routing=True, exact_hrus=True)
        self.assertEqual(plan["added_hru_ids"], [])
        self.assertEqual(len(plan["warnings"]), 1)
        self.assertIn("only channel inflows", plan["warnings"][0])
        self.assertIn("3", plan["warnings"][0])  # channel 3 is the crash case

    def test_unused_routing_unit_is_reported_as_a_warning(self):
        work = self.tmp / "orphan"
        build_dataset(work)
        lines = read_lines(work / "rout_unit.con")
        lines.append(con_row(7, "ru_orphan", 7, []))
        lines[lines.index(next(l for l in lines if l.startswith("1 ru1_A")))] = con_row(
            1, "ru1_A", 1, [("res", 1, 1), ("hru", 2, 1), ("aqu", 1, 1), ("ru", 7, 1)])
        write_lines(work / "rout_unit.con", lines)
        write_lines(work / "rout_unit.def", read_lines(work / "rout_unit.def") + ["7 ru_orphan 1 99"])
        plan = quiet(hp.plan_hru_subset, str(work), [1], keep_routing=True, exact_hrus=True)
        self.assertTrue(any("left out" in warning and "7" in warning for warning in plan["warnings"]))

    def test_missing_hru_is_an_error_in_both_modes(self):
        for keep_routing in (True, False):
            with self.assertRaisesRegex(ValueError, r"not found in hru.con: \[99\]"):
                quiet(hp.plan_hru_subset, str(self.src), [1, 99], keep_routing=keep_routing)

    def test_cli_plan_needs_hru_ids_and_cannot_be_combined(self):
        code, text = run_cli("--dataset", str(self.src), "--plan", "--json")
        self.assertEqual(code, 1)
        self.assertIn("--hru-ids is required with --plan", json.loads(text)["error"])
        code, text = run_cli("--dataset", str(self.src), "--plan", "--hru-range", "--hru-ids", "1", "--json")
        self.assertEqual(code, 1)
        self.assertIn("cannot be combined", json.loads(text)["error"])

    def test_cli_plan_text_mode_says_nothing_was_written(self):
        code, text = run_cli("--dataset", str(self.src), "--hru-ids", "1", "--keep-routing", "--plan")
        self.assertEqual(code, 0)
        self.assertIn("nothing written", text)
        self.assertIn("would add HRU 4", text)

    def test_real_run_result_now_carries_warnings(self):
        _, result = self.subset([1], keep_routing=True, exact_hrus=True)
        self.assertEqual(len(result["warnings"]), 1)
        _, result = self.subset([1, 3])
        self.assertEqual(result["warnings"], [])


class HruTableTests(TempDirTest):
    LANDUSE = [
        "lulc test",
        "NAME CAL_GRP PLNT_COM MGT CN2",
        "lum 1 up_plant mgt_a cn_a",
        "lum 2 rip_plant null cn_b",
    ]

    def table(self, root=None):
        return quiet(hp.build_hru_table, str(root or self.src))

    def with_landuse(self):
        # hru-data.hru in the fixture points every HRU at LU_MGT "lum"
        write_lines(self.src / "landuse.lum", self.LANDUSE[:3] + ["lum_wet grp wetn null cn_c"])

    def test_one_row_per_hru_with_the_picker_columns(self):
        self.with_landuse()
        table = self.table()
        self.assertEqual(table["total_hrus"], 6)
        self.assertEqual([row["id"] for row in table["rows"]], [1, 2, 3, 4, 5, 6])
        row = table["rows"][0]
        self.assertEqual(row, {
            "id": 1, "name": "hru1", "landuse": "lum", "landuse_group": "1", "plant_community": "up_plant",
            "management": "mgt_a", "area_ha": 10.0, "subbasin": "A", "routing_unit": "ru1_A",
            "wetland": False, "wetland_name": None, "receives_upstream": False,
        })

    def test_wetland_flag_follows_surf_stor(self):
        by_id = {row["id"]: row for row in self.table()["rows"]}
        self.assertEqual([by_id[i]["wetland"] for i in range(1, 7)], [False, True, False, True, False, True])
        self.assertEqual(by_id[2]["wetland_name"], "wet_A")
        self.assertIsNone(by_id[1]["wetland_name"])

    def test_receives_upstream_when_a_con_file_routes_to_the_hru(self):
        by_id = {row["id"]: row for row in self.table()["rows"]}
        # ru1_x routes to its riparian HRU (2, 4, 6); nothing routes to the upland HRUs
        self.assertEqual([by_id[i]["receives_upstream"] for i in range(1, 7)],
                         [False, True, False, True, False, True])

    def test_routing_unit_is_the_unit_that_lists_the_hru(self):
        by_id = {row["id"]: row for row in self.table()["rows"]}
        self.assertEqual(by_id[1]["routing_unit"], "ru1_A")
        self.assertEqual(by_id[2]["routing_unit"], "ru2_A")
        self.assertEqual(by_id[6]["routing_unit"], "ru2_C")

    def test_subbasin_comes_from_ls_unit_then_routing_unit_then_weather_station(self):
        table = self.table()
        self.assertEqual([row["subbasin"] for row in table["rows"]], ["A", "A", "B", "B", "C", "C"])
        self.assertEqual(table["subbasin_sources"], {"ls_unit": 6})
        (self.src / "ls_unit.def").unlink()
        table = self.table()
        self.assertEqual([row["subbasin"] for row in table["rows"]], ["A", "A", "B", "B", "C", "C"])
        self.assertEqual(table["subbasin_sources"], {"routing_unit": 6})
        for name in ("rout_unit.def", "rout_unit.ele"):
            (self.src / name).unlink()
        table = self.table()
        self.assertEqual({row["subbasin"] for row in table["rows"]}, {"wst"})
        self.assertEqual(table["subbasin_sources"], {"weather_station": 6})
        self.assertTrue(any("routing unit" in warning for warning in table["warnings"]))

    def test_subbasin_is_none_when_nothing_names_it(self):
        for name in ("ls_unit.def", "rout_unit.def", "rout_unit.ele"):
            (self.src / name).unlink()
        lines = read_lines(self.src / "hru.con")
        write_lines(self.src / "hru.con", [line.replace(" wst ", " null ") for line in lines])
        table = self.table()
        self.assertTrue(all(row["subbasin"] is None for row in table["rows"]))
        self.assertEqual(table["subbasin_sources"], {})
        self.assertIn("ls_unit.def", table["subbasin_rule"])

    def test_optional_files_may_be_missing(self):
        for name in ("hru-data.hru", "landuse.lum", "rout_unit.ele", "rout_unit.def", "ls_unit.def", "ls_unit.ele"):
            path = self.src / name
            if path.exists():
                path.unlink()
        table = self.table()
        self.assertEqual(table["total_hrus"], 6)
        row = table["rows"][0]
        self.assertIsNone(row["landuse"])
        self.assertIsNone(row["plant_community"])
        self.assertFalse(row["wetland"])
        self.assertIsNone(row["routing_unit"])
        self.assertEqual(len(table["warnings"]), 2)  # hru-data.hru and the routing unit files

    def test_hru_con_is_required(self):
        (self.src / "hru.con").unlink()
        with self.assertRaisesRegex(ValueError, "hru.con not found"):
            self.table()

    def test_file_names_match_case_insensitively(self):
        os.rename(self.src / "hru-data.hru", self.src / "HRU-DATA.HRU")
        by_id = {row["id"]: row for row in self.table()["rows"]}
        self.assertTrue(by_id[2]["wetland"])

    def test_a_folder_with_txtinout_is_resolved(self):
        parent = self.tmp / "project"
        parent.mkdir()
        shutil.copytree(self.src, parent / "TxtInOut")
        self.assertEqual(self.table(parent)["total_hrus"], 6)

    def test_read_only(self):
        before = tree_fingerprint(self.tmp)
        self.table()
        self.assertEqual(tree_fingerprint(self.tmp), before)

    def test_cli_json_is_compact_and_text_mode_lists_the_rows(self):
        code, text = run_cli("--dataset", str(self.src), "--hru-table", "--json")
        self.assertEqual(code, 0)
        self.assertNotIn("\n  ", text)
        self.assertEqual(json.loads(text)["total_hrus"], 6)
        code, text = run_cli("--dataset", str(self.src), "--hru-table")
        self.assertEqual(code, 0)
        self.assertIn("6 HRUs in", text)
        self.assertIn("ru2_A", text)

    def test_cli_error_is_json(self):
        (self.src / "hru.con").unlink()
        code, text = run_cli("--dataset", str(self.src), "--hru-table", "--json")
        self.assertEqual(code, 1)
        self.assertFalse(json.loads(text)["ok"])

    def test_read_table_skips_the_count_line_before_the_header(self):
        columns, rows = hp.read_table(str(self.src), "ls_unit.def")
        self.assertEqual(columns["lsu_name"], 1)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][:2], ["1", "sub_A"])


class SourceCheckerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        (self.root / "src").mkdir()

    def write_src(self, name, text):
        (self.root / "src" / name).write_text(text, encoding="latin-1")

    def statuses(self):
        result = hp.check_swat_source(self.root)
        return {w["id"]: w["status"] for w in result["workarounds"]}, result

    def test_present_patterns_are_still_needed(self):
        self.write_src("ch_temp.f90", "      trib1_temp = ob(iob)%hin_d(in-1)%temp\n")
        self.write_src("et_act.f90", "  es_max = wet_hyd(ihyd)%evrsv * (1.-pcom(j)%lai_sum / 4.) * pet\n")
        self.write_src("water_allocation_read.f90", '      if (.not. i_exist .or. in_wallo%pou /= "null") then\n')
        self.write_src("basin_print_codes_read.f90", "  ... is not a valid object.\n")
        statuses, result = self.statuses()
        self.assertEqual(statuses, {"W1": "still_needed", "W2": "still_needed", "W3": "still_needed", "W4": "unknown"})
        w1 = result["workarounds"][0]["checks"][0]
        self.assertEqual((w1["status"], w1["lines"]), ("present", [1]))

    def test_fixed_code_is_no_longer_needed(self):
        self.write_src("ch_temp.f90", "      trib1_temp = ob(iob)%hin_d(max(in-1,1))%temp\n")
        self.write_src("et_act.f90", "  es_max = wet_hyddb(ihyd)%evrsv\n")
        self.write_src("water_allocation_read.f90", '      if (i_exist .and. in_wallo%pou /= "null") then\n')
        self.write_src("basin_print_codes_read.f90", 'case ("basin_sed_bud")\n  ... is not a valid object.\n')
        statuses, _ = self.statuses()
        self.assertEqual(statuses["W1"], "no_longer_needed")
        self.assertEqual(statuses["W2"], "no_longer_needed")
        self.assertEqual(statuses["W3"], "no_longer_needed")

    def test_missing_source_file_is_unknown(self):
        self.write_src("ch_temp.f90", "      trib1_temp = ob(iob)%hin_d(in-1)%temp\n")
        statuses, _ = self.statuses()
        self.assertEqual(statuses["W1"], "still_needed")
        self.assertEqual(statuses["W2"], "unknown")
        self.assertEqual(statuses["W3"], "unknown")

    def test_file_names_match_case_insensitively_and_known_bugs_are_reported(self):
        self.write_src("CH_TEMP.F90", "trib1_temp = ob(iob)%hin_d(in-1)%temp\n")
        self.write_src("ru_read_elements.f90", "allocate (ru_def(imax))\nallocate (ob(iob)%ru(1), source = 0)\n")
        statuses, result = self.statuses()
        self.assertEqual(statuses["W1"], "still_needed")
        known = {k["id"]: k["status"] for k in result["known_bugs"]}
        self.assertEqual(known["K2"], "present")
        self.assertEqual(known["K1"], "unknown")

    def test_cli_prints_json(self):
        self.write_src("ch_temp.f90", "      trib1_temp = ob(iob)%hin_d(in-1)%temp\n")
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = hp.main(["--check-swat-source", str(self.root)])
        self.assertEqual(code, 0)
        payload = json.loads(buffer.getvalue())
        self.assertTrue(payload["ok"])
        self.assertEqual([w["id"] for w in payload["workarounds"]], ["W1", "W2", "W3", "W4"])

    def test_folder_without_src_is_an_error(self):
        with self.assertRaises(ValueError):
            hp.check_swat_source(self.root / "nowhere")


if __name__ == "__main__":
    unittest.main()
