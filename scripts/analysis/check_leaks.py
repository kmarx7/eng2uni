"""Fail when stage 4 outputs share an 8-word run with the exam corpus.

Scans analysis/*.json and docs/analysis/*.md. Prints only file, location and
overlap counts, never the matched words (CLAUDE.md: corpus text stays in corpus/).
"""

from __future__ import annotations

import sys
from pathlib import Path

from csat_stats.leak import NGRAM, corpus_ngrams, exam_texts, scan_file
from csat_stats.texts import load_exams

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    exams = load_exams(ROOT / "corpus/structured")
    if not exams:
        print("no corpus/structured exams; nothing to check against", file=sys.stderr)
        return 1
    index = corpus_ngrams(t for exam in exams for t in exam_texts(exam))
    files = sorted((ROOT / "analysis").glob("*.json")) + sorted((ROOT / "docs/analysis").glob("*.md"))
    hits = [h for f in files for h in scan_file(f, index)]
    for h in hits:
        print(f"LEAK {h.file} {h.where}: {h.overlaps} shared {NGRAM}-gram(s)")
    print(f"checked {len(files)} files against {len(index)} corpus {NGRAM}-grams: {'FAIL' if hits else 'ok'}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
