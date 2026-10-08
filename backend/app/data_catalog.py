"""Explicit mapping from public dataset/domain IDs to local sample files."""

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path


DATA_ROOT = Path(__file__).resolve().parents[2] / "data"


@dataclass(frozen=True)
class DomainSource:
    id: str
    name: str
    color: str
    samples_path: Path


@dataclass(frozen=True)
class DatasetSource:
    id: str
    name: str
    metadata_path: Path
    sae_explanations_path: Path | None
    domains: tuple[DomainSource, ...]


# Add another DomainSource or DatasetSource here when a new corpus is available.
DATASETS = (
    DatasetSource(
        id="pilecc_300",
        name="Pile-CC 300",
        metadata_path=DATA_ROOT / "pilecc_300" / "metadata.json",
        sae_explanations_path=DATA_ROOT / "sae_feature_explanations",
        domains=(
            DomainSource(
                id="pilecc",
                name="pilecc",
                color="#4778ae",
                samples_path=DATA_ROOT / "pilecc_300" / "samples.jsonl",
            ),
        ),
    ),
)


@lru_cache(maxsize=16)
def load_samples(samples_path: Path) -> tuple[dict, ...]:
    """Keep the small JSONL sample catalog in memory after its first read."""
    with samples_path.open(encoding="utf-8") as source:
        return tuple(json.loads(line) for line in source if line.strip())


@lru_cache(maxsize=16)
def load_metadata(metadata_path: Path) -> dict:
    with metadata_path.open(encoding="utf-8") as source:
        return json.load(source)


def find_dataset(dataset_id: str) -> DatasetSource | None:
    return next((item for item in DATASETS if item.id == dataset_id), None)


def find_domain(dataset: DatasetSource, domain_id: str) -> DomainSource | None:
    return next((item for item in dataset.domains if item.id == domain_id), None)
