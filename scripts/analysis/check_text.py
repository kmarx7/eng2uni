"""Score content-pipeline drafts against the exam corpus.

Reads JSON [{id, text}] on stdin and prints {status, results: [{id, score, overlap}]}.
score is the number of 8-word runs shared with corpus/structured. Only ids and
counts are printed, never the matched words (CLAUDE.md: corpus text stays in corpus/).
Without corpus/structured the status is "skipped" and the exit code is 0.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from csat_stats.leak import corpus_ngrams, exam_texts, ngrams, words
from csat_stats.texts import load_exams

ROOT = Path(__file__).resolve().parents[2]


def check(items: list[dict], structured_dir: Path) -> dict:
    exams = load_exams(structured_dir) if structured_dir.is_dir() else []
    if not exams:
        return {"status": "skipped", "results": []}
    index = corpus_ngrams(t for exam in exams for t in exam_texts(exam))
    results = []
    for item in items:
        score = sum(1 for g in ngrams(words(item["text"])) if g in index)
        results.append({"id": item["id"], "score": score, "overlap": score > 0})
    return {"status": "checked", "results": results}


def main() -> int:
    items = json.load(sys.stdin)
    print(json.dumps(check(items, ROOT / "corpus/structured")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
