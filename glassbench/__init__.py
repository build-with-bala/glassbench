"""GlassBench — a memory benchmark that measures whether a system knows when it
*doesn't* know.

This package implements the *scorer* exactly as fixed in ``PRE_REGISTRATION.md``
(frozen 2026-06-15). The public entry point is ``glassbench.score``; the answer
matcher lives in ``glassbench.match`` and the bias-corrected calibration estimator
in ``glassbench.calib``.

Nothing in here may change the metric definitions or the Glass Score weights — those
are part of the frozen contract. Bug fixes that change scores ship only as a new
versioned benchmark (v0.2, ...).
"""

__version__ = "0.1.0"

# Frozen Glass Score weights (PRE_REGISTRATION.md "Glass Score").
# Kept here as a single source of truth so the scorer and any tooling agree.
GLASS_WEIGHTS = {
    "cwr": 0.30,            # applied to (1 - CWR)
    "aurc": 0.25,           # applied to (1 - AURC_norm)
    "abst_contra": 0.15,    # applied to AbstentionRecall_contradiction
    "abst_false": 0.15,     # applied to AbstentionRecall_false_premise
    "ece": 0.10,            # applied to (1 - ECE)
    "brier": 0.05,          # applied to (1 - Brier)
}

# Frozen thresholds from PRE_REGISTRATION.md "Metrics (exact)".
CWR_CONFIDENCE_THRESHOLD = 0.70   # confidence >= 0.70 counts as "confident"
ABSTAIN_CONFIDENCE_THRESHOLD = 0.5  # confidence < 0.5 counts as "effectively abstained"
ECE_N_BINS = 15                    # pooled, equal-mass 15 bins

# Split taxonomy (PRE_REGISTRATION.md "Splits").
ANSWERABLE_SPLITS = ("answerable", "stale")
UNANSWERABLE_SPLITS = ("contradiction", "false_premise")

__all__ = [
    "__version__",
    "GLASS_WEIGHTS",
    "CWR_CONFIDENCE_THRESHOLD",
    "ABSTAIN_CONFIDENCE_THRESHOLD",
    "ECE_N_BINS",
    "ANSWERABLE_SPLITS",
    "UNANSWERABLE_SPLITS",
]
