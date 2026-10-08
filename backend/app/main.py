"""Read-only sample catalog and expert routing APIs."""

from pathlib import Path
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from .data_catalog import (
    DATASETS,
    DomainSource,
    find_dataset,
    find_domain,
    load_metadata,
    load_samples,
)
from .context_index import (
    display_token_texts,
    load_context_index,
    search_token_text,
    token_sentence,
    token_snippet,
)
from .sae_explanations import load_feature_explanation


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DomainSummary(ApiModel):
    id: str
    name: str
    color: str
    sample_count: int


class DatasetSummary(ApiModel):
    id: str
    name: str
    model_name: str
    layer_count: int
    expert_count: int
    routing_top_k: int
    sae_top_k: int
    domains: list[DomainSummary]


class SampleSummary(ApiModel):
    sample_id: str
    domain_id: str
    text_preview: str
    token_count: int
    match_token_indices: list[int] = Field(default_factory=list)
    match_count: int = 0
    match_before: str = ""
    match_text: str = ""
    match_after: str = ""


class SampleDetail(SampleSummary):
    text: str
    tokens: list[str]
    token_texts: list[str]
    source: str
    document_id: str
    stream_index: int
    chunk_token_start: int
    chunk_token_end: int


class RoutedExpert(ApiModel):
    expert_id: int
    weight: float
    rank: int


class LayerRouting(ApiModel):
    layer_index: int
    experts: list[RoutedExpert]


class TokenRouting(ApiModel):
    sample_id: str
    token_index: int
    token: str
    layer_count: int
    expert_count: int
    routing_top_k: int
    layers: list[LayerRouting]


class ContextExample(ApiModel):
    sample_id: str
    domain_id: str
    token_index: int
    weight: float
    before: str
    highlight: str
    after: str
    sentence_before: str
    sentence_highlight: str
    sentence_after: str


class ContextDomainMix(ApiModel):
    domain_id: str
    selection_count: int


class ExpertContext(ApiModel):
    expert_id: int
    selection_count: int
    domain_mix: list[ContextDomainMix]
    examples: list[ContextExample]


class ExpertContexts(ApiModel):
    layer_index: int
    experts: list[ExpertContext]


class SaeFeature(ApiModel):
    rank: int
    feature_id: int
    activation: float
    semantics: str | None


class TokenSaeFeatures(ApiModel):
    sample_id: str
    token_index: int
    layer_index: int
    features: list[SaeFeature]


class ProjectionSample(ApiModel):
    sample_id: str
    domain_id: str
    points: list[tuple[int, float, float]]


class ProjectionData(ApiModel):
    dataset_id: str
    method: str
    point_count: int
    samples: list[ProjectionSample]


app = FastAPI(title="MoE Expert & SAE Explorer API")
app.add_middleware(GZipMiddleware, minimum_size=1000)


@lru_cache(maxsize=4)
def load_projection(path: Path, modified_ns: int) -> tuple[str, str, list[ProjectionSample]]:
    """Read a generated projection once; mtime invalidates the cache after recompute."""
    del modified_ns
    with np.load(path, allow_pickle=False) as source:
        if int(source["schema_version"]) != 1:
            raise ValueError("Unsupported projection format")
        dataset_id = str(source["dataset_id"])
        method = str(source["method"])
        sample_ids = source["sample_ids"]
        domain_ids = source["domain_ids"]
        offsets = source["sample_offsets"]
        token_indices = source["token_indices"]
        coordinates = source["coordinates"]
    if (
        len(sample_ids) != len(domain_ids)
        or len(offsets) != len(sample_ids) + 1
        or len(token_indices) != len(coordinates)
        or int(offsets[-1]) != len(coordinates)
        or coordinates.ndim != 2
        or coordinates.shape[1] != 2
    ):
        raise ValueError("Projection arrays do not align")
    samples = [
        ProjectionSample(
            sample_id=str(sample_ids[index]),
            domain_id=str(domain_ids[index]),
            points=[
                (int(token_indices[position]), float(coordinates[position, 0]), float(coordinates[position, 1]))
                for position in range(int(offsets[index]), int(offsets[index + 1]))
            ],
        )
        for index in range(len(sample_ids))
    ]
    return dataset_id, method, samples


@app.get("/api/datasets/{dataset_id}/projection", response_model=ProjectionData)
def get_projection(dataset_id: str, domains: str = "") -> ProjectionData:
    dataset = find_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    selected_ids = set(domains.split(",")) if domains else {domain.id for domain in dataset.domains}
    if not selected_ids or selected_ids - {domain.id for domain in dataset.domains}:
        raise HTTPException(status_code=404, detail="Domain not found")
    projection_path = dataset.metadata_path.parent / "projection.npz"
    if not projection_path.is_file():
        raise HTTPException(status_code=503, detail="Projection unavailable; run pipeline/build_projection.py")
    try:
        projected_id, method, samples = load_projection(
            projection_path, projection_path.stat().st_mtime_ns
        )
    except (OSError, KeyError, ValueError) as error:
        raise HTTPException(status_code=503, detail="Projection data is invalid") from error
    if projected_id != dataset_id:
        raise HTTPException(status_code=503, detail="Projection belongs to another dataset")
    selected_samples = [sample for sample in samples if sample.domain_id in selected_ids]
    projected_counts = {
        domain_id: sum(sample.domain_id == domain_id for sample in selected_samples)
        for domain_id in selected_ids
    }
    expected_counts = {
        domain.id: len(load_samples(domain.samples_path))
        for domain in dataset.domains
        if domain.id in selected_ids
    }
    if projected_counts != expected_counts:
        raise HTTPException(status_code=503, detail="Projection is stale; recompute it")
    return ProjectionData(
        dataset_id=dataset_id,
        method=method,
        point_count=sum(len(sample.points) for sample in selected_samples),
        samples=selected_samples,
    )


def require_domain(dataset_id: str, domain_id: str) -> DomainSource:
    dataset = find_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    domain = find_domain(dataset, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    if not domain.samples_path.is_file():
        raise HTTPException(status_code=503, detail="Sample data is unavailable")
    return domain


def summarize_sample(
    sample: dict,
    domain_id: str,
    samples_path: Path | None = None,
    query: str = "",
) -> SampleSummary:
    return SampleSummary(
        sample_id=sample["sample_id"],
        domain_id=domain_id,
        text_preview=" ".join(sample["text"].split())[:160],
        token_count=sample["seq_len_collected"],
        **(search_token_text(samples_path, sample, query) if query and samples_path else {}),
    )


@app.get("/api/datasets", response_model=list[DatasetSummary])
def list_datasets() -> list[DatasetSummary]:
    return [
        DatasetSummary(
            id=dataset.id,
            name=dataset.name,
            model_name=load_metadata(dataset.metadata_path)["model_path"].rsplit("/", 1)[-1],
            layer_count=load_metadata(dataset.metadata_path)["n_layers"],
            expert_count=load_metadata(dataset.metadata_path)["num_local_experts"],
            routing_top_k=load_metadata(dataset.metadata_path)["routing_topk"],
            sae_top_k=load_metadata(dataset.metadata_path)["sae_topk"],
            domains=[
                DomainSummary(
                    id=domain.id,
                    name=domain.name,
                    color=domain.color,
                    sample_count=len(load_samples(domain.samples_path))
                    if domain.samples_path.is_file()
                    else 0,
                )
                for domain in dataset.domains
            ],
        )
        for dataset in DATASETS
    ]


@app.get(
    "/api/datasets/{dataset_id}/samples",
    response_model=list[SampleSummary],
)
def list_dataset_samples(
    dataset_id: str, domains: str = "", query: str = ""
) -> list[SampleSummary]:
    dataset = find_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    selected_ids = set(domains.split(",")) if domains else {d.id for d in dataset.domains}
    unknown_ids = selected_ids - {d.id for d in dataset.domains}
    if unknown_ids:
        raise HTTPException(status_code=404, detail="Domain not found")
    normalized_query = query.strip().casefold()
    summaries = []
    for domain in dataset.domains:
        if domain.id not in selected_ids:
            continue
        for sample in load_samples(domain.samples_path):
            summary = summarize_sample(
                sample, domain.id, domain.samples_path, normalized_query
            )
            if not normalized_query or summary.match_count:
                summaries.append(summary)
    return summaries


@app.get(
    "/api/datasets/{dataset_id}/domains/{domain_id}/samples",
    response_model=list[SampleSummary],
)
def list_samples(
    dataset_id: str, domain_id: str, query: str = ""
) -> list[SampleSummary]:
    domain = require_domain(dataset_id, domain_id)
    normalized_query = query.strip().casefold()
    summaries = []
    for sample in load_samples(domain.samples_path):
        summary = summarize_sample(
            sample, domain_id, domain.samples_path, normalized_query
        )
        if not normalized_query or summary.match_count:
            summaries.append(summary)
    return summaries


@app.get(
    "/api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}",
    response_model=SampleDetail,
)
def get_sample(dataset_id: str, domain_id: str, sample_id: str) -> SampleDetail:
    domain = require_domain(dataset_id, domain_id)
    sample = next(
        (
            item
            for item in load_samples(domain.samples_path)
            if item["sample_id"] == sample_id
        ),
        None,
    )
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    return SampleDetail(
        **summarize_sample(sample, domain_id).model_dump(),
        text=sample["text"],
        tokens=sample["tokens"],
        token_texts=display_token_texts(domain.samples_path, sample),
        source=sample["source"],
        document_id=sample["document_id"],
        stream_index=sample["stream_index"],
        chunk_token_start=sample["chunk_token_start"],
        chunk_token_end=sample["chunk_token_end"],
    )


@app.get(
    "/api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}"
    "/tokens/{token_index}/routing",
    response_model=TokenRouting,
)
def get_token_routing(
    dataset_id: str, domain_id: str, sample_id: str, token_index: int
) -> TokenRouting:
    domain = require_domain(dataset_id, domain_id)
    sample = next(
        (item for item in load_samples(domain.samples_path) if item["sample_id"] == sample_id),
        None,
    )
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    if token_index < 0 or token_index >= sample["seq_len_collected"]:
        raise HTTPException(status_code=422, detail="Token index is outside this sample")

    shard_name = sample["shard"]
    if shard_name != Path(shard_name).name:
        raise HTTPException(status_code=503, detail="Shard data is unavailable")
    shard_path = domain.samples_path.parent / "shards" / shard_name
    if not shard_path.is_file():
        raise HTTPException(status_code=503, detail="Shard data is unavailable")

    with np.load(shard_path, allow_pickle=False) as shard:
        row = sample["row_in_shard"]
        if shard["sample_ids"][row] != sample_id or not shard["attention_mask"][row, token_index]:
            raise HTTPException(status_code=503, detail="Shard and sample catalog do not match")
        expert_ids = shard["expert_indices"][row, token_index]
        weights = shard["expert_weights"][row, token_index]

    dataset = find_dataset(dataset_id)
    assert dataset is not None
    metadata = load_metadata(dataset.metadata_path)
    return TokenRouting(
        sample_id=sample_id,
        token_index=token_index,
        token=sample["tokens"][token_index],
        layer_count=metadata["n_layers"],
        expert_count=metadata["num_local_experts"],
        routing_top_k=metadata["routing_topk"],
        layers=[
            LayerRouting(
                layer_index=layer_index,
                experts=[
                    RoutedExpert(expert_id=int(expert_id), weight=float(weight), rank=rank)
                    for rank, (expert_id, weight) in enumerate(zip(layer_ids, layer_weights))
                ],
            )
            for layer_index, (layer_ids, layer_weights) in enumerate(zip(expert_ids, weights))
        ],
    )


@app.get(
    "/api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}"
    "/tokens/{token_index}/sae-features",
    response_model=TokenSaeFeatures,
)
def get_token_sae_features(
    dataset_id: str, domain_id: str, sample_id: str, token_index: int, layer: int
) -> TokenSaeFeatures:
    domain = require_domain(dataset_id, domain_id)
    dataset = find_dataset(dataset_id)
    assert dataset is not None
    metadata = load_metadata(dataset.metadata_path)
    if not 0 <= layer < metadata["n_layers"]:
        raise HTTPException(status_code=422, detail="Layer index is outside this dataset")
    sample = next(
        (item for item in load_samples(domain.samples_path) if item["sample_id"] == sample_id),
        None,
    )
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    if not 0 <= token_index < sample["seq_len_collected"]:
        raise HTTPException(status_code=422, detail="Token index is outside this sample")

    shard_name = sample["shard"]
    if shard_name != Path(shard_name).name:
        raise HTTPException(status_code=503, detail="Shard data is unavailable")
    shard_path = domain.samples_path.parent / "shards" / shard_name
    if not shard_path.is_file():
        raise HTTPException(status_code=503, detail="Shard data is unavailable")
    with np.load(shard_path, allow_pickle=False) as shard:
        row = sample["row_in_shard"]
        if shard["sample_ids"][row] != sample_id or not shard["attention_mask"][row, token_index]:
            raise HTTPException(status_code=503, detail="Shard and sample catalog do not match")
        feature_ids = shard["feature_indices"][row, token_index, layer]
        activations = shard["feature_values"][row, token_index, layer]

    positions = sorted(range(len(activations)), key=lambda position: -float(activations[position]))
    return TokenSaeFeatures(
        sample_id=sample_id,
        token_index=token_index,
        layer_index=layer,
        features=[
            SaeFeature(
                rank=rank,
                feature_id=int(feature_ids[position]),
                activation=float(activations[position]),
                semantics=load_feature_explanation(
                    dataset.sae_explanations_path, layer, int(feature_ids[position])
                ),
            )
            for rank, position in enumerate(positions, start=1)
        ],
    )


@app.get(
    "/api/datasets/{dataset_id}/layers/{layer_index}/expert-contexts",
    response_model=ExpertContexts,
)
def get_expert_contexts(
    dataset_id: str, layer_index: int, experts: str, domains: str = ""
) -> ExpertContexts:
    dataset = find_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    metadata = load_metadata(dataset.metadata_path)
    if not 0 <= layer_index < metadata["n_layers"]:
        raise HTTPException(status_code=422, detail="Layer index is outside this dataset")
    try:
        expert_ids = [int(value) for value in experts.split(",")]
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid expert IDs") from error
    if (
        not expert_ids
        or len(expert_ids) > metadata["routing_topk"]
        or len(set(expert_ids)) != len(expert_ids)
        or any(not 0 <= expert_id < metadata["num_local_experts"] for expert_id in expert_ids)
    ):
        raise HTTPException(status_code=422, detail="Invalid expert IDs")

    selected_ids = set(domains.split(",")) if domains else {domain.id for domain in dataset.domains}
    if not selected_ids or selected_ids - {domain.id for domain in dataset.domains}:
        raise HTTPException(status_code=404, detail="Domain not found")
    selected_domains = [domain for domain in dataset.domains if domain.id in selected_ids]
    sources = []
    for domain in selected_domains:
        require_domain(dataset_id, domain.id)
        index_path = domain.samples_path.parent / "expert_contexts.json"
        if not index_path.is_file():
            raise HTTPException(status_code=503, detail=f"Expert context index is unavailable for {domain.id}")
        sources.append(
            (
                domain,
                load_context_index(index_path)["layers"].get(str(layer_index), {}),
                {sample["sample_id"]: sample for sample in load_samples(domain.samples_path)},
            )
        )

    contexts = []
    for expert_id in expert_ids:
        occurrences = []
        domain_mix = []
        for domain, layer, samples in sources:
            entry = layer.get(str(expert_id), {})
            domain_mix.append(
                ContextDomainMix(domain_id=domain.id, selection_count=entry.get("selectionCount", 0))
            )
            for example in entry.get("examples", []):
                sample = samples[example["sampleId"]]
                occurrences.append((domain, sample, example))

        occurrences.sort(
            key=lambda item: (-item[2]["weight"], item[0].id, item[1]["sample_id"])
        )
        examples = [
            ContextExample(
                sample_id=sample["sample_id"],
                domain_id=domain.id,
                token_index=example["tokenIndex"],
                weight=example["weight"],
                **token_snippet(domain.samples_path, sample, example["tokenIndex"]),
                **token_sentence(domain.samples_path, sample, example["tokenIndex"]),
            )
            for domain, sample, example in occurrences[:15]
        ]
        contexts.append(
            ExpertContext(
                expert_id=expert_id,
                selection_count=sum(item.selection_count for item in domain_mix),
                domain_mix=domain_mix,
                examples=examples,
            )
        )
    return ExpertContexts(layer_index=layer_index, experts=contexts)
