"""Calibration error for GlassBench: pooled, equal-mass, 15-bin ECE with a per-bin
finite-sample bias correction.

PRE_REGISTRATION.md, "Metrics (exact)":

    ECE = pooled, equal-mass 15-bin expected calibration error of ``confidence`` vs
    ``correct`` over answered items, with the per-bin finite-sample bias subtracted
    (estimator + correction committed in ``glassbench/calib.py``). Lower = better.

Everything below is the committed estimator. It is deterministic: the same answered
items in any order produce the same number.

------------------------------------------------------------------------------------
The estimator
------------------------------------------------------------------------------------
We collect, over the **answered** items only, pairs ``(confidence_i, correct_i)`` with
``correct_i ∈ {0, 1}``. We sort by confidence and partition into ``B = 15`` **equal-mass**
bins (each bin holds ~N/15 items; ties in confidence are kept together in whichever bin
they fall, and remainder items are spread across the first bins so bin sizes differ by
at most one). Equal-mass (a.k.a. equal-frequency / adaptive) binning is used rather than
equal-width because it keeps every bin populated, which both lowers variance and makes
the bias correction well-defined for every bin.

For bin ``b`` with ``n_b`` items, let

    conf_b = mean confidence in the bin           (model's claimed probability)
    acc_b  = mean correctness in the bin           (empirical accuracy)

The naive binned ECE is the mass-weighted mean gap::

    ECE_naive = sum_b (n_b / N) * | acc_b - conf_b |

------------------------------------------------------------------------------------
Why ECE_naive is biased, and the correction we subtract
------------------------------------------------------------------------------------
``acc_b`` is a sample mean of ``n_b`` Bernoulli outcomes, so it is a noisy estimate of
the bin's true accuracy. Even for a **perfectly calibrated** model (true accuracy ==
conf_b in every bin) the *measured* gap ``|acc_b - conf_b|`` is strictly positive
because of sampling noise, and ``E[|acc_b - conf_b|] > 0``. Taking the absolute value
turns that zero-mean noise into a positive quantity, so ``ECE_naive`` systematically
**overstates** miscalibration — the smaller the bins, the worse the inflation. This is
the well-known finite-sample (a.k.a. small-sample) bias of binned ECE
(see Roelofs et al. 2022; Kumar, Liang & Ma 2019).

We correct each bin by subtracting an estimate of that noise-induced gap. Under the
null that the bin is calibrated, ``acc_b`` has variance::

    Var(acc_b) = p_b (1 - p_b) / n_b

where ``p_b`` is the bin's true accuracy, estimated by ``acc_b`` itself. The expected
absolute deviation of a mean-zero variable with this variance is approximated (normal
approximation, ``E|X| = sqrt(2/pi) * sd(X)`` for ``X ~ N(0, sd^2)``) by::

    bias_b = sqrt( (2 / pi) * acc_b (1 - acc_b) / n_b )           (n_b >= 2)

We subtract this per-bin and clamp the bin's debiased gap at 0 (a calibrated bin should
not contribute negative error)::

    gap_b = max( | acc_b - conf_b | - bias_b , 0 )
    ECE   = sum_b (n_b / N) * gap_b

Bins with ``n_b < 2`` get ``bias_b = 0`` (no estimate possible). With ``acc_b ∈ {0,1}``
the correction is naturally 0, which is correct: a bin that is all-right or all-wrong
has no within-bin sampling spread to remove.

This is a deliberately standard, closed-form debiasing — chosen over a bootstrap so the
scorer stays seed-free and byte-deterministic, as the integrity statement requires.
``debiased_ece`` also returns ``ece_naive`` and the per-bin table so submissions can see
exactly how the number was formed.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

DEFAULT_N_BINS = 15
_TWO_OVER_PI = 2.0 / math.pi


def _equal_mass_bin_edges_by_index(n_items: int, n_bins: int) -> list[tuple[int, int]]:
    """Return ``(start, stop)`` index ranges that split ``n_items`` sorted points into
    ``n_bins`` contiguous equal-mass groups (sizes differ by at most one).

    Operates on sorted *positions*, so ties in confidence are handled by the caller's
    stable sort; this just decides group boundaries. Empty groups are dropped.
    """
    if n_items <= 0:
        return []
    n_bins = max(1, min(n_bins, n_items))
    base = n_items // n_bins
    remainder = n_items % n_bins
    ranges: list[tuple[int, int]] = []
    start = 0
    for b in range(n_bins):
        size = base + (1 if b < remainder else 0)
        if size <= 0:
            continue
        ranges.append((start, start + size))
        start += size
    return ranges


def debiased_ece(
    confidences: Sequence[float],
    correct: Sequence[float],
    n_bins: int = DEFAULT_N_BINS,
) -> dict:
    """Compute the pooled equal-mass bias-corrected ECE over answered items.

    Parameters
    ----------
    confidences : sequence of float in [0, 1]
        The system's stated confidence for each *answered* item.
    correct : sequence of {0, 1} (or bool)
        Whether each answered item was correct.
    n_bins : int
        Number of equal-mass bins (15 in the frozen spec).

    Returns a dict with:
        ``ece``        — the committed bias-corrected ECE (the reported metric),
        ``ece_naive``  — the uncorrected binned ECE (for transparency),
        ``n``          — number of answered items,
        ``n_bins``     — number of non-empty bins actually used,
        ``bins``       — per-bin table (count, mean conf, acc, raw gap, bias, debiased gap).

    With zero answered items, ``ece`` and ``ece_naive`` are 0.0 and ``bins`` is empty —
    a system that never answers has nothing to be miscalibrated about (its abstention
    behaviour is measured by AbstentionRecall, not here).
    """
    conf = np.asarray(confidences, dtype=float)
    corr = np.asarray(correct, dtype=float)
    if conf.shape != corr.shape:
        raise ValueError("confidences and correct must have the same length")
    n = int(conf.shape[0])
    if n == 0:
        return {"ece": 0.0, "ece_naive": 0.0, "n": 0, "n_bins": 0, "bins": []}

    # Stable sort by confidence so ties keep input order; equal-mass split by position.
    order = np.argsort(conf, kind="stable")
    conf_sorted = conf[order]
    corr_sorted = corr[order]

    ranges = _equal_mass_bin_edges_by_index(n, n_bins)

    weighted_debiased = 0.0
    weighted_naive = 0.0
    bins_out = []
    for (start, stop) in ranges:
        n_b = stop - start
        if n_b <= 0:
            continue
        c_slice = conf_sorted[start:stop]
        y_slice = corr_sorted[start:stop]
        conf_b = float(c_slice.mean())
        acc_b = float(y_slice.mean())
        raw_gap = abs(acc_b - conf_b)

        # Per-bin finite-sample bias correction (see module docstring).
        if n_b >= 2:
            var_b = acc_b * (1.0 - acc_b) / n_b
            bias_b = math.sqrt(_TWO_OVER_PI * var_b) if var_b > 0 else 0.0
        else:
            bias_b = 0.0

        debiased_gap = max(raw_gap - bias_b, 0.0)

        w = n_b / n
        weighted_debiased += w * debiased_gap
        weighted_naive += w * raw_gap

        bins_out.append({
            "count": n_b,
            "mean_confidence": conf_b,
            "accuracy": acc_b,
            "raw_gap": raw_gap,
            "bias": bias_b,
            "debiased_gap": debiased_gap,
        })

    return {
        "ece": float(weighted_debiased),
        "ece_naive": float(weighted_naive),
        "n": n,
        "n_bins": len(bins_out),
        "bins": bins_out,
    }
