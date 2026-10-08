"""Precompute one shared 2D projection from binary expert selections.

Run from the repository root with::

    backend/.venv/bin/python pipeline/build_projection.py pilecc_300

Each valid token is a sparse 48 x 128 (or dataset-specific) binary vector.
The selected top-k experts in every layer are 1; all other entries are 0.
The default SVD step compresses these binary vectors to 64 dimensions before
UMAP uses cosine distance; `--svd-components 0` skips that approximation.
Token order is kept separately for drawing sample trajectories, not used to
influence the embedding itself.
"""

import argparse
import os
from pathlib import Path
import sys

import numpy as np
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
import umap


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.data_catalog import find_dataset, load_metadata, load_samples  # noqa: E402


def build_projection(
    dataset_id: str, output: Path | None = None, svd_components: int = 64
) -> Path:
    dataset = find_dataset(dataset_id)
    if dataset is None:
        raise ValueError(f"Unknown dataset: {dataset_id}")
    metadata = load_metadata(dataset.metadata_path)
    layer_count = int(metadata["n_layers"])
    expert_count = int(metadata["num_local_experts"])
    top_k = int(metadata["routing_topk"])
    feature_count = layer_count * expert_count
    layer_offsets = (np.arange(layer_count, dtype=np.int32) * expert_count)[None, :, None]

    matrices: list[sparse.csr_matrix] = []
    sample_ids: list[str] = []
    domain_ids: list[str] = []
    token_indices: list[np.ndarray] = []
    sample_offsets = [0]

    for domain in dataset.domains:
        samples = load_samples(domain.samples_path)
        by_shard: dict[str, list[dict]] = {}
        for sample in samples:
            shard_name = sample["shard"]
            if shard_name != Path(shard_name).name:
                raise ValueError(f"Invalid shard path: {shard_name}")
            by_shard.setdefault(shard_name, []).append(sample)

        for shard_name, shard_samples in by_shard.items():
            shard_path = domain.samples_path.parent / "shards" / shard_name
            with np.load(shard_path, allow_pickle=False) as shard:
                for sample in shard_samples:
                    row = int(sample["row_in_shard"])
                    if shard["sample_ids"][row] != sample["sample_id"]:
                        raise ValueError(f"Sample mismatch in {shard_path}: {sample['sample_id']}")
                    positions = np.flatnonzero(shard["attention_mask"][row]).astype(np.int32)
                    if len(positions) != int(sample["seq_len_collected"]):
                        raise ValueError(f"Token count mismatch: {sample['sample_id']}")
                    expert_ids = shard["expert_indices"][row, positions]
                    if expert_ids.shape[1:] != (layer_count, top_k):
                        raise ValueError(f"Unexpected routing shape: {expert_ids.shape}")
                    if np.any(expert_ids < 0) or np.any(expert_ids >= expert_count):
                        raise ValueError(f"Expert ID outside 0..{expert_count - 1}")

                    columns = (expert_ids.astype(np.int32) + layer_offsets).reshape(-1)
                    rows = np.repeat(np.arange(len(positions), dtype=np.int32), layer_count * top_k)
                    values = np.ones(len(columns), dtype=np.float32)
                    matrix = sparse.csr_matrix(
                        (values, (rows, columns)),
                        shape=(len(positions), feature_count),
                        dtype=np.float32,
                    )
                    matrix.sum_duplicates()
                    matrix.data[:] = 1
                    matrices.append(matrix)
                    sample_ids.append(sample["sample_id"])
                    domain_ids.append(domain.id)
                    token_indices.append(positions)
                    sample_offsets.append(sample_offsets[-1] + len(positions))
            print(f"Read {domain.id}/{shard_name}: {sample_offsets[-1]} tokens", flush=True)

    if not matrices:
        raise ValueError("No valid tokens found")
    routing = sparse.vstack(matrices, format="csr", dtype=np.float32)
    print(f"Loaded {routing.shape[0]} tokens, {routing.shape[1]} binary features", flush=True)
    if svd_components:
        if not 0 < svd_components < feature_count:
            raise ValueError("SVD components must be between 1 and feature count - 1")
        print(f"Reducing sparse routing vectors to {svd_components} components", flush=True)
        routing = TruncatedSVD(
            n_components=svd_components, n_iter=4, random_state=42
        ).fit_transform(routing)
    print(f"Fitting cosine UMAP on {routing.shape[0]} tokens", flush=True)
    coordinates = umap.UMAP(
        n_components=2,
        n_neighbors=30,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
        n_jobs=1,
        low_memory=True,
    ).fit_transform(routing).astype(np.float32)

    target = output or dataset.metadata_path.parent / "projection.npz"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    with temporary.open("wb") as stream:
        np.savez_compressed(
            stream,
            schema_version=np.array(1, dtype=np.int32),
            dataset_id=np.array(dataset_id),
            method=np.array(
                f"binary-expert-svd{svd_components}-cosine-umap"
                if svd_components
                else "binary-expert-cosine-umap"
            ),
            sample_ids=np.asarray(sample_ids),
            domain_ids=np.asarray(domain_ids),
            sample_offsets=np.asarray(sample_offsets, dtype=np.int32),
            token_indices=np.concatenate(token_indices).astype(np.int16),
            coordinates=coordinates,
        )
    os.replace(temporary, target)
    print(f"Saved {target} ({len(sample_ids)} trajectories, {len(coordinates)} points)", flush=True)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset_id", help="Dataset ID from backend/app/data_catalog.py")
    parser.add_argument("--output", type=Path, help="Override output path")
    parser.add_argument(
        "--svd-components", type=int, default=64,
        help="SVD dimensions before UMAP; use 0 for direct sparse UMAP (default: 64)",
    )
    args = parser.parse_args()
    build_projection(args.dataset_id, args.output, args.svd_components)
