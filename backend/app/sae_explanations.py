"""Look up optional SAE feature explanations by layer and feature ID."""

from functools import lru_cache
import json
from pathlib import Path


def load_feature_explanation(
    explanations_path: Path | None, layer_index: int, feature_id: int
) -> str | None:
    if explanations_path is None:
        return None
    path = explanations_path / f"L{layer_index:02d}_F{feature_id:05d}_explain_v1.json"
    if not path.is_file():
        return None
    return _read_explanation(path, path.stat().st_mtime_ns, layer_index, feature_id)


@lru_cache(maxsize=8192)
def _read_explanation(
    path: Path, modified_at: int, layer_index: int, feature_id: int
) -> str | None:
    del modified_at  # Changing a file's mtime invalidates its cache entry.
    with path.open(encoding="utf-8") as source:
        result = json.load(source)
    if (
        result.get("layer") != layer_index
        or result.get("feature_id") != feature_id
        or result.get("complete") is not True
    ):
        return None
    explanation = result.get("explanation")
    return explanation.strip() if isinstance(explanation, str) and explanation.strip() else None
