"""Per-sentence syntax features from a spaCy dependency parse.

Rules (approximate; the parser is en_core_web_sm):
- A clause is a verb or auxiliary that has its own subject (nsubj, nsubjpass,
  csubj, csubjpass, expl) or is the sentence root. Infinitive and participle
  phrases have no subject and are not clauses.
- Clause depth: the root clause is 1. A clause one level inside another adds 1;
  a clause joined by coordination (conj) stays at its partner's depth.
- relativeClause: relcl that is a clause. nounClause: ccomp/csubj/csubjpass/pcomp
  that is a clause. toInfinitive: "to" (TO) as aux of a base-form verb.
  participlePhrase: VBG/VBN heading acl/advcl/relcl with no subject and no aux.
  inversion: a finite auxiliary or copula before its own subject in a sentence
  that is not a question.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .lexicon import is_word

SUBJECTS = {"nsubj", "nsubjpass", "csubj", "csubjpass", "expl"}
NOUN_CLAUSE_DEPS = {"ccomp", "csubj", "csubjpass", "pcomp"}
PHRASE_DEPS = {"acl", "advcl", "relcl"}
CONSTRUCTIONS = ("relativeClause", "participlePhrase", "toInfinitive", "nounClause", "inversion")


@dataclass
class Features:
    words: int
    clauses: int
    max_depth: int
    depths: list[int] = field(default_factory=list)
    constructions: dict[str, int] = field(default_factory=dict)


def is_clause_head(token) -> bool:
    if token.dep_ in ("aux", "auxpass"):
        return False
    if token.dep_ == "ROOT":
        return True
    return token.pos_ in ("VERB", "AUX") and any(c.dep_ in SUBJECTS for c in token.children)


def _depth(head, cache: dict) -> int:
    if head.i in cache:
        return cache[head.i]
    only_conj = True
    node = head
    while node.dep_ != "ROOT" and node.head is not node:
        only_conj = only_conj and node.dep_ == "conj"
        node = node.head
        if is_clause_head(node):
            cache[head.i] = _depth(node, cache) + (0 if only_conj else 1)
            return cache[head.i]
    cache[head.i] = 1
    return 1


def _inverted(head) -> bool:
    subjects = [c for c in head.children if c.dep_ in ("nsubj", "nsubjpass")]
    if not subjects:
        return False
    finite = [c for c in head.children if c.dep_ in ("aux", "auxpass") and "Fin" in c.morph.get("VerbForm")]
    if head.pos_ == "AUX":
        finite.append(head)
    if not finite:
        # "Never have I seen": the parser may tag the fronted "have" as Inf.
        finite = [c for c in head.children if c.dep_ in ("aux", "auxpass")]
    return bool(finite) and min(f.i for f in finite) < subjects[0].i


def sentence_features(sent) -> Features:
    heads = [t for t in sent if is_clause_head(t)]
    cache: dict = {}
    depths = [_depth(h, cache) for h in heads]
    counts = dict.fromkeys(CONSTRUCTIONS, 0)
    question = sent.text.rstrip().endswith("?")
    for h in heads:
        if h.dep_ == "relcl":
            counts["relativeClause"] += 1
        if h.dep_ in NOUN_CLAUSE_DEPS:
            counts["nounClause"] += 1
    for t in sent:
        if t.tag_ == "TO" and t.dep_ == "aux" and t.head.tag_ == "VB":
            counts["toInfinitive"] += 1
        if (
            t.tag_ in ("VBG", "VBN")
            and t.dep_ in PHRASE_DEPS
            and not is_clause_head(t)
            and not any(c.dep_ in ("aux", "auxpass") for c in t.children)
        ):
            counts["participlePhrase"] += 1
    if not question and any(_inverted(h) for h in heads):
        counts["inversion"] = 1
    return Features(
        words=sum(1 for t in sent if is_word(t)),
        clauses=len(heads),
        max_depth=max(depths, default=0),
        depths=depths,
        constructions=counts,
    )
