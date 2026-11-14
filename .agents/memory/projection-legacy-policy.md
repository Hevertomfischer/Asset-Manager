---
name: Legacy versus trusted model performance
description: User-approved treatment of historical projections without proven pre-match freezing
---

Keep old projections visible as a separate **Legado** section, with an explicit
warning that pre-match freezing is not guaranteed. Do not include those results
in the trusted series or retroactively mark them as frozen.

**Why:** The user chose the separate-legacy option rather than hiding history.
Refetching accurate results fixes the targets, but does not prove that the
old predictions were made without access to those results.

**How to apply:** All trusted performance, backtests and public accuracy claims
must use frozen predictions. If there are none, show an empty trusted series,
not a zero MAE. A recalibration using legacy training data is not evidence of
prospective accuracy.
