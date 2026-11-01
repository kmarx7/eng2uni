"""The one place that loads spaCy."""

from __future__ import annotations

from functools import lru_cache

MODEL = "en_core_web_sm"


@lru_cache(maxsize=1)
def load_model(name: str = MODEL):
    import spacy

    return spacy.load(name)


def model_info(nlp) -> dict:
    import spacy

    return {"spacy": spacy.__version__, "model": f"{nlp.meta['lang']}_{nlp.meta['name']}-{nlp.meta['version']}"}
