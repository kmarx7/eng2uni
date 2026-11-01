"""Stage 4: past-exam statistics (DESIGN 14-3 step 4, 14-5).

Reads corpus/structured/ and writes analysis/vocab_frequency.json,
analysis/syntax_stats.json, analysis/passage_stats.json and
docs/analysis/REPORT.md. Outputs hold counts and lemmas only; run
check_leaks.py afterwards (npm run analyze does both).
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from csat_stats.lexicon import COUNTED_KINDS, coverage_curve, is_word, lemma_key, normalize_lemma, token_kind
from csat_stats.nlp import load_model, model_info
from csat_stats.passages import SEGMENT_START_WORDS, count_markers, cue_class
from csat_stats.report import render_report
from csat_stats.summary import distribution, histogram
from csat_stats.syntax import CONSTRUCTIONS, sentence_features
from csat_stats.texts import Unit, load_exams, units_from_exam

ROOT = Path(__file__).resolve().parents[2]
SCOPES = ("all", "since2018")
SINCE = 2018
CURVE_SIZES = [500, 1000, 2000, 3000, 4000, 5000, 8000]
CUE_TYPES = ("ordering", "insertion")
CUE_CLASSES = ("demonstrative", "article", "connective")


def scopes_of(unit: Unit) -> tuple[str, ...]:
    return SCOPES if unit.year >= SINCE else ("all",)


def word_lemmas(doc) -> list[tuple[str, str, str]]:
    return [(normalize_lemma(t.lemma_), token_kind(t), t.pos_) for t in doc if is_word(t)]


def vocab_stats(units, docs, option_docs, meta) -> dict:
    counts = {s: Counter() for s in SCOPES}
    exams = {s: defaultdict(set) for s in SCOPES}
    pos = defaultdict(Counter)
    kinds = defaultdict(Counter)
    types = defaultdict(set)
    tokens = Counter()
    for unit, doc in zip(units, docs):
        for lemma, kind, upos in word_lemmas(doc):
            key = lemma_key(lemma, kind)
            pos[key][upos] += 1
            kinds[key][kind] += 1
            types[key].add(unit.item_type)
            for s in scopes_of(unit):
                counts[s][key] += 1
                exams[s][key].add(unit.exam_id)
                tokens[s] += 1
    in_options = {lemma_key(lemma, kind) for doc in option_docs for lemma, kind, _ in word_lemmas(doc)}
    # Majority kind for merged content/function entries (e.g. "be" -> function).
    kind_of = {key: kinds[key].most_common(1)[0][0] for key in kinds}

    lemmas = [
        {
            "lemma": key[0],
            "kind": kind_of[key],
            "pos": pos[key].most_common(1)[0][0],
            "totalCount": n,
            "examCount": len(exams["all"][key]),
            "itemTypes": sorted(types[key]),
            "inAnswerOptions": key in in_options,
            "since2018": {
                "totalCount": counts["since2018"][key],
                "examCount": len(exams["since2018"][key]),
            },
        }
        for key, n in sorted(counts["all"].items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    totals, curves = {}, {}
    for s in SCOPES:
        entries = [{"lemma": key[0], "kind": kind_of[key], "totalCount": n} for key, n in counts[s].items()]
        totals[s] = {
            "tokens": tokens[s],
            "countedTokens": sum(e["totalCount"] for e in entries if e["kind"] in COUNTED_KINDS),
            "lemmas": len(entries),
        }
        curves[s] = [{"topN": c["topN"], "coverage": round(c["coverage"], 4)} for c in coverage_curve(entries, CURVE_SIZES)]
    return {"meta": meta, "totals": totals, "coverageCurve": curves, "lemmas": lemmas}


def syntax_stats(units, docs, meta) -> dict:
    acc = defaultdict(lambda: {"len": [], "clauses": [], "depth": [], "cons": Counter()})
    for unit, doc in zip(units, docs):
        for sent in doc.sents:
            f = sentence_features(sent)
            if f.words == 0:
                continue
            for s in scopes_of(unit):
                for t in (unit.item_type, "all"):
                    a = acc[(s, t)]
                    a["len"].append(f.words)
                    a["clauses"].append(f.clauses)
                    a["depth"].append(f.max_depth)
                    a["cons"].update(f.constructions)
    by_scope = {s: {} for s in SCOPES}
    for (s, t), a in sorted(acc.items()):
        n = len(a["len"])
        by_scope[s][t] = {
            "sentences": n,
            "sentenceLength": distribution(a["len"]),
            "sentenceLengthHistogram": histogram(a["len"], [1, 11, 21, 31, 41, 51]),
            "clausesPerSentence": distribution(a["clauses"]),
            "clauseCountHistogram": histogram(a["clauses"], [0, 1, 2, 3, 4, 5]),
            "clauseDepthHistogram": histogram(a["depth"], [0, 1, 2, 3, 4, 5]),
            "constructions": {
                c: {"count": a["cons"][c], "per100Sentences": round(100 * a["cons"][c] / n, 2) if n else 0}
                for c in CONSTRUCTIONS
            },
        }
    return {"meta": meta, "byScope": by_scope}


def passage_stats(units, docs, segment_docs, meta) -> dict:
    acc = defaultdict(lambda: {"words": [], "paras": [], "markers": Counter()})
    cue = defaultdict(lambda: {"segments": 0, "words": 0, "overall": Counter(), "start": Counter()})
    for unit, doc, segs in zip(units, docs, segment_docs):
        words = sum(1 for t in doc if is_word(t))
        markers = count_markers(unit.text)
        for s in scopes_of(unit):
            for t in (unit.item_type, "all"):
                a = acc[(s, t)]
                a["words"].append(words)
                a["paras"].append(unit.paragraphs)
                a["markers"].update(markers)
            if unit.item_type in CUE_TYPES:
                c = cue[(s, unit.item_type)]
                c["words"] += words
                c["overall"].update(k for k in map(cue_class, doc) if k)
                c["segments"] += len(segs)
                for seg in segs:
                    first = [t for t in seg if is_word(t)][:SEGMENT_START_WORDS]
                    c["start"].update(k for k in map(cue_class, first) if k)
    by_scope = {s: {} for s in SCOPES}
    for (s, t), a in sorted(acc.items()):
        total_words = sum(a["words"]) or 1
        by_scope[s][t] = {
            "passages": len(a["words"]),
            "wordCount": distribution(a["words"]),
            "paragraphs": distribution(a["paras"]),
            "discourseMarkers": [
                {"marker": m, "count": n, "per1000Words": round(1000 * n / total_words, 3)}
                for m, n in sorted(a["markers"].items(), key=lambda kv: (-kv[1], kv[0]))
            ],
        }
    cues = {s: {} for s in SCOPES}
    for (s, t), c in sorted(cue.items()):
        cues[s][t] = {
            "segments": c["segments"],
            "words": c["words"],
            "overall": {k: {"count": c["overall"][k], "per1000Words": round(1000 * c["overall"][k] / (c["words"] or 1), 3)} for k in CUE_CLASSES},
            "atSegmentStart": {k: {"count": c["start"][k], "perSegment": round(c["start"][k] / (c["segments"] or 1), 3)} for k in CUE_CLASSES},
        }
    return {"meta": meta, "byScope": by_scope, "cues": cues}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--structured", type=Path, default=ROOT / "corpus/structured")
    ap.add_argument("--out", type=Path, default=ROOT / "analysis")
    ap.add_argument("--report", type=Path, default=ROOT / "docs/analysis/REPORT.md")
    args = ap.parse_args()

    exams = load_exams(args.structured)
    if not exams:
        raise SystemExit(f"no exams in {args.structured}; run structure_exams.py first")
    units = [u for exam in exams for u in units_from_exam(exam)]
    nlp = load_model()
    meta = {
        "generator": "scripts/analysis/analyze_corpus.py",
        **model_info(nlp),
        "exams": [e["examId"] for e in exams],
        "since2018Exams": [e["examId"] for e in exams if int(e["year"]) >= SINCE],
    }
    docs = list(nlp.pipe((u.text for u in units), batch_size=32))
    option_docs = list(nlp.pipe((o for u in units for o in u.options), batch_size=64))
    segment_docs = [list(nlp.pipe(u.segments)) if u.item_type in CUE_TYPES else [] for u in units]

    vocab = vocab_stats(units, docs, option_docs, meta)
    syntax = syntax_stats(units, docs, meta)
    passages = passage_stats(units, docs, segment_docs, meta)
    write_json(args.out / "vocab_frequency.json", vocab)
    write_json(args.out / "syntax_stats.json", syntax)
    write_json(args.out / "passage_stats.json", passages)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(render_report(vocab, syntax, passages), encoding="utf-8")
    print(f"{len(exams)} exams, {len(units)} passages, {vocab['totals']['all']['tokens']} word tokens -> {args.out}")


if __name__ == "__main__":
    main()
