# SWAT+ Tools

An extension pack, not an extension: installing this pulls in both

- [SWAT+ Dataset Selector](https://github.com/tugraskan/swatplus-dataselector) —
  dataset browsing, FK navigation, output exploration
- [Fortran ifx Debug](https://github.com/tugraskan/vsc_ifx_debug) — the
  `fortran-ifx` debug adapter

so a new machine gets both with one install instead of two, and each still
updates independently through VS Code's normal extension auto-update.

[Tamandua](https://github.com/tugraskan/Tamandua) (the SWAT+ Fortran source
index) isn't a VS Code extension and isn't part of this pack; install it with
`pip install git+https://github.com/tugraskan/Tamandua.git`.
