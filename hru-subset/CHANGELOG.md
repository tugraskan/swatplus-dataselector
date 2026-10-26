# Changelog

## 0.1.0

First version, built locally; not published.

- **SWAT+ HRU Subset: Create Subset…** picks a dataset, asks for HRU ids
  (`1,4-6,10`) and the subset options, creates the subset next to the dataset
  and offers to open it or run SWAT+ on it.
- Runs the repo-root `hru_processor.py` (copied in at build time) with one
  Python interpreter, probed first; the Microsoft Store `python3` stub is
  skipped and the script is never retried with another interpreter.
- Always passes `--output-dir` and refuses an output folder inside the dataset.
- Writes `hru_subset_result.json` into each subset and warns when a subset is
  picked as the dataset.
- Offers to delete the partly made output folder after a failed run.
