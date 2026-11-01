"""Distribution summaries and histograms for the stats files."""

from __future__ import annotations

from collections import Counter
from typing import Sequence


def percentile(sorted_values: Sequence[float], q: float) -> float:
    """Linear interpolation between closest ranks (q in 0..1)."""
    if not sorted_values:
        return 0.0
    pos = (len(sorted_values) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def distribution(values: Sequence[float]) -> dict:
    v = sorted(values)
    if not v:
        return {k: 0 for k in ("n", "mean", "median", "p10", "p25", "p75", "p90", "min", "max")}
    r = lambda x: round(float(x), 2)  # noqa: E731
    return {
        "n": len(v),
        "mean": r(sum(v) / len(v)),
        "median": r(percentile(v, 0.5)),
        "p10": r(percentile(v, 0.1)),
        "p25": r(percentile(v, 0.25)),
        "p75": r(percentile(v, 0.75)),
        "p90": r(percentile(v, 0.9)),
        "min": r(v[0]),
        "max": r(v[-1]),
    }


def histogram(values: Sequence[int], edges: Sequence[int], top_label: str | None = None) -> list[dict]:
    """Bins [edges[i], edges[i+1]-1]; values at or above the last edge go to the open bin."""
    counts = Counter()
    for x in values:
        for lo, hi in zip(edges, edges[1:]):
            if lo <= x < hi:
                counts[(lo, hi)] += 1
                break
        else:
            if x >= edges[-1]:
                counts["top"] += 1
    out = []
    for lo, hi in zip(edges, edges[1:]):
        label = str(lo) if hi - lo == 1 else f"{lo}-{hi - 1}"
        out.append({"bin": label, "count": counts[(lo, hi)]})
    out.append({"bin": top_label or f"{edges[-1]}+", "count": counts["top"]})
    return out
