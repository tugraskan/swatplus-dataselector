# SWAT+ Tools

An extension pack, not an extension: installing this pulls in all of

- [SWAT+ Dataset Selector](https://github.com/tugraskan/swatplus-dataselector) —
  dataset browsing, FK navigation, output exploration
- [SWAT+ HRU Subset](https://github.com/tugraskan/swatplus-dataselector/tree/master/hru-subset) —
  carve a dataset down to the HRUs you pick, in a new folder next to it
- [Fortran Debug (ifx / gfortran)](https://github.com/tugraskan/vsc_ifx_debug) —
  the `fortran-debug` debug adapter
- SWAT+ Investigator (`PbsandtDev.swat-investigator`)

so a new machine gets them with one install instead of four, and each still
updates independently through VS Code's normal extension auto-update. Each is
also its own extension on the Marketplace, so you can install any of them
without the others.

[Tamandua](https://github.com/tugraskan/Tamandua) (the SWAT+ Fortran source
index) isn't a VS Code extension and isn't part of this pack; install it with
`pip install git+https://github.com/tugraskan/Tamandua.git`.
