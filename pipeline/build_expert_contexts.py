"""Precompute the highest-weight occurrence per sample, layer and expert.

Run from the repository root with:
    backend/.venv/bin/python pipeline/build_expert_contexts.py data/pilecc_300
"""

import argparse
import csv
import json
from pathlib import Path

import numpy as np


MAX_EXAMPLES = 15
MISSING_TOKEN = np.iinfo(np.int16).max


def build(source_dir: Path) -> Path:
    with (source_dir / "metadata.json").open(encoding="utf-8") as file:
        metadata = json.load(file)
    with (source_dir / "samples.jsonl").open(encoding="utf-8") as file:
        samples = [json.loads(line) for line in file if line.strip()]

    layer_count = metadata["n_layers"]
    expert_count = metadata["num_local_experts"]
    sample_count = len(samples)
    sample_positions = {sample["sample_id"]: index for index, sample in enumerate(samples)}
    shape = (sample_count, layer_count, expert_count)
    best_weights = np.full(shape, -1, dtype=np.float32)
    best_tokens = np.full(shape, MISSING_TOKEN, dtype=np.int16)
    for shard_path in sorted((source_dir / "shards").glob("*.npz")):
        with np.load(shard_path, allow_pickle=False) as shard:
            sample_ids = [str(sample_id) for sample_id in shard["sample_ids"]]
            ids = shard["expert_indices"]
            weights = shard["expert_weights"]
            attention = shard["attention_mask"]
            assert ids.shape == weights.shape
            assert ids.shape[2:] == (layer_count, metadata["routing_topk"])
            assert attention.shape == ids.shape[:2]
        for row, sample_id in enumerate(sample_ids):
            sample_position = sample_positions[sample_id]
            valid_length = int(attention[row].sum())
            token_indices = np.repeat(np.arange(valid_length), metadata["routing_topk"])
            for layer_index in range(layer_count):
                expert_ids = ids[row, :valid_length, layer_index].ravel()
                values = weights[row, :valid_length, layer_index].ravel()
                order = np.lexsort((token_indices, -values, expert_ids))
                sorted_experts = expert_ids[order]
                first = np.r_[True, sorted_experts[1:] != sorted_experts[:-1]]
                winners = order[first]
                best_weights[sample_position, layer_index, expert_ids[winners]] = values[winners]
                best_tokens[sample_position, layer_index, expert_ids[winners]] = token_indices[winners]

    result: dict[str, object] = {
        "version": 1,
        "sampleCount": sample_count,
        "maxExamplesPerExpert": MAX_EXAMPLES,
        "layers": {},
    }
    layers: dict[str, dict] = result["layers"]  # type: ignore[assignment]
    with (source_dir / "expert_summary.csv").open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            layer_index = int(row["layer"])
            expert_id = int(row["expert_id"])
            values = best_weights[:, layer_index, expert_id]
            positions = np.flatnonzero(values >= 0)
            positions = positions[np.lexsort((positions, -values[positions]))][:MAX_EXAMPLES]
            layers.setdefault(str(layer_index), {})[str(expert_id)] = {
                "selectionCount": int(row["selection_count"]),
                "sampleCount": int(row["sample_count"]),
                "examples": [
                    {
                        "sampleId": samples[position]["sample_id"],
                        "tokenIndex": int(best_tokens[position, layer_index, expert_id]),
                        "weight": float(values[position]),
                    }
                    for position in positions
                ],
            }

    output = source_dir / "expert_contexts.json"
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    args = parser.parse_args()
    print(build(args.source_dir))
