"""Load the compact expert index and render token-aligned text snippets."""

from bisect import bisect_left, bisect_right
from functools import lru_cache
import json
from pathlib import Path
import re


@lru_cache(maxsize=16)
def load_context_index(index_path: Path) -> dict:
    with index_path.open(encoding="utf-8") as source:
        index = json.load(source)
    if index.get("version") != 1:
        raise ValueError(f"Unsupported expert context index: {index_path}")
    return index


def _byte_decoder() -> dict[str, int]:
    # Qwen's byte-level BPE uses the same reversible byte-to-character map.
    printable = list(range(33, 127)) + list(range(161, 173)) + list(range(174, 256))
    mapped = printable.copy()
    extra = 0
    for byte in range(256):
        if byte not in printable:
            mapped.append(256 + extra)
            printable.append(byte)
            extra += 1
    return dict(zip((chr(value) for value in mapped), printable))


BYTE_DECODER = _byte_decoder()
SENTENCE_END = re.compile(r"[.!?。！？]+(?:[\"'”’）)\]]*)?(?=\s|$)")


@lru_cache(maxsize=1024)
def _decoded_sample(samples_path: Path, sample_id: str, tokens: tuple[str, ...]) -> tuple[str, tuple[int, ...]]:
    del samples_path, sample_id  # Keys keep the cache separate across catalogs.
    offsets = [0]
    pieces = []
    for token in tokens:
        piece = bytes(BYTE_DECODER[char] for char in token)
        pieces.append(piece)
        offsets.append(offsets[-1] + len(piece))
    return b"".join(pieces).decode("utf-8", errors="replace"), tuple(offsets)


def token_snippet(samples_path: Path, sample: dict, token_index: int, radius: int = 24) -> dict[str, str]:
    text, token_offsets = _decoded_sample(samples_path, sample["sample_id"], tuple(sample["tokens"]))
    if not 0 <= token_index < len(token_offsets) - 1:
        raise IndexError("Token index is outside this sample")
    char_offsets = [0]
    for char in text:
        char_offsets.append(char_offsets[-1] + len(char.encode("utf-8")))
    start = bisect_right(char_offsets, token_offsets[token_index]) - 1
    end = bisect_left(char_offsets, token_offsets[token_index + 1])
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    clean = lambda value: re.sub(r"\s+", " ", value)
    return {
        "before": ("…" if left else "") + clean(text[left:start]),
        "highlight": text[start:end].replace("\n", " "),
        "after": clean(text[end:right]) + ("…" if right < len(text) else ""),
    }


def token_sentence(samples_path: Path, sample: dict, token_index: int) -> dict[str, str]:
    """Return the full punctuation-bounded sentence around one routed token."""
    text, token_offsets = _decoded_sample(
        samples_path, sample["sample_id"], tuple(sample["tokens"])
    )
    if not 0 <= token_index < len(token_offsets) - 1:
        raise IndexError("Token index is outside this sample")
    char_offsets = [0]
    for char in text:
        char_offsets.append(char_offsets[-1] + len(char.encode("utf-8")))
    token_start = bisect_right(char_offsets, token_offsets[token_index]) - 1
    token_end = bisect_left(char_offsets, token_offsets[token_index + 1])
    sentence_start = 0
    sentence_end = len(text)
    for boundary in SENTENCE_END.finditer(text):
        if boundary.end() <= token_start:
            sentence_start = boundary.end()
        elif boundary.end() >= token_end:
            sentence_end = boundary.end()
            break
    return {
        "sentence_before": text[sentence_start:token_start].lstrip(),
        "sentence_highlight": text[token_start:token_end],
        "sentence_after": text[token_end:sentence_end].rstrip(),
    }


def search_token_text(samples_path: Path, sample: dict, query: str) -> dict:
    """Find visible text occurrences and map each one to its starting token."""
    text, token_offsets = _decoded_sample(
        samples_path, sample["sample_id"], tuple(sample["tokens"])
    )
    matches = list(re.finditer(re.escape(query), text, flags=re.IGNORECASE))
    char_byte_offsets = [0]
    for char in text:
        char_byte_offsets.append(char_byte_offsets[-1] + len(char.encode("utf-8")))
    indices = list(dict.fromkeys(
        min(
            bisect_right(token_offsets, char_byte_offsets[match.start()]) - 1,
            len(token_offsets) - 2,
        )
        for match in matches
    ))
    if not matches:
        return {
            "match_token_indices": [],
            "match_count": 0,
            "match_before": "",
            "match_text": "",
            "match_after": "",
        }
    first = matches[0]
    left = max(0, first.start() - 20)
    right = min(len(text), first.end() + 55)
    clean = lambda value: re.sub(r"\s+", " ", value)
    return {
        "match_token_indices": indices,
        "match_count": len(matches),
        "match_before": ("…" if left else "") + clean(text[left:first.start()]),
        "match_text": text[first.start():first.end()],
        "match_after": clean(text[first.end():right])
        + ("…" if right < len(text) else ""),
    }


def display_token_texts(samples_path: Path, sample: dict) -> list[str]:
    """Split decoded sample text by token while keeping UTF-8 characters intact."""
    text, token_offsets = _decoded_sample(
        samples_path, sample["sample_id"], tuple(sample["tokens"])
    )
    pieces = [""] * len(sample["tokens"])
    byte_offset = 0
    for char in text:
        index = min(bisect_right(token_offsets, byte_offset) - 1, len(pieces) - 1)
        pieces[index] += char
        byte_offset += len(char.encode("utf-8"))
    return pieces
