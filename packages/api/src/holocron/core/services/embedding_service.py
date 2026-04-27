"""Text embedding service.

Wraps `fastembed` (ONNX-based, no PyTorch) with the BAAI/bge-small-en-v1.5
model — 384-dimensional vectors, ~130 MB on disk, runs on CPU, ~10 ms per
sentence on a modest VPS. Chosen to fit on an 8 GB RAM server without a GPU.

The service is a lazy singleton: the model is loaded on first use so API
boot stays fast, and the ~300 MB resident memory cost is only paid when
embeddings are actually computed. The model download happens once and
lives in `$HOME/.cache/fastembed`.

Indexing a catalog of ~1 M assets at 10 ms each = ~3 hours of CPU time.
For the live write path (single embeddings on create/update) it's a
non-issue.
"""

from __future__ import annotations

from threading import Lock
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastembed import TextEmbedding

# Small, CPU-friendly, widely used. Alternative: "sentence-transformers/
# all-MiniLM-L6-v2" (384-dim, slightly lower quality, marginally faster).
_MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384


class EmbeddingService:
    """Singleton wrapper around a CPU-only embedding model."""

    _instance: EmbeddingService | None = None
    _lock: Lock = Lock()

    def __init__(self) -> None:
        # Don't touch fastembed here — loading the model hits disk + RAM.
        # We materialize lazily on first `embed*` call.
        self._model: TextEmbedding | None = None
        self._model_lock: Lock = Lock()

    @classmethod
    def instance(cls) -> EmbeddingService:
        """Process-wide singleton. Safe to call from multiple request tasks."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _get_model(self) -> TextEmbedding:
        if self._model is None:
            with self._model_lock:
                if self._model is None:
                    # Imported lazily so the dep can be absent during unit
                    # tests that never touch embeddings.
                    from fastembed import TextEmbedding

                    # `threads=1` keeps the memory footprint predictable on
                    # small servers; ONNX uses ~200 MB per extra thread.
                    self._model = TextEmbedding(model_name=_MODEL_NAME, threads=1)
        return self._model

    def embed_one(self, text: str) -> list[float]:
        """Embed a single short document. Returns a 384-float vector."""
        model = self._get_model()
        # `embed` yields an iterable of numpy arrays; pull the first one.
        vector = next(iter(model.embed([text])))
        return vector.tolist()

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch. Much faster than repeated embed_one() for
        large input sets — fastembed batches internally."""
        if not texts:
            return []
        model = self._get_model()
        return [v.tolist() for v in model.embed(texts)]


def asset_embedding_text(
    name: str,
    description: str | None,
    asset_type: str | None,
    location: str | None,
) -> str:
    """Canonical string representation for asset embedding.

    Kept here so the same text is used at write time and at schema/backfill
    time. Order matters mildly — BGE / MiniLM models are trained on
    natural-language-like inputs, so we frame it like a short descriptor
    sentence rather than raw KV pairs.
    """
    parts: list[str] = [name]
    if asset_type:
        parts.append(f"({asset_type})")
    if description:
        parts.append(description)
    if location:
        parts.append(f"at {location}")
    return ". ".join(parts)


def actor_embedding_text(
    name: str,
    description: str | None,
    actor_type: str | None,
    email: str | None,
) -> str:
    """Canonical string for actor embeddings. Frames the actor as a short
    natural-language description so queries like 'marketing people' or
    'data team in Paris' land on the right rows."""
    parts: list[str] = [name]
    if actor_type:
        parts.append(f"({actor_type})")
    if email:
        parts.append(f"email {email}")
    if description:
        parts.append(description)
    return ". ".join(parts)


def rule_embedding_text(
    name: str,
    description: str | None,
    severity: str | None,
    category: str | None,
) -> str:
    """Canonical string for rule embeddings. Rule names can be terse
    ("col-not-null"), so the description usually does the heavy lifting
    for semantic matching."""
    parts: list[str] = [name]
    if category:
        parts.append(f"[{category}]")
    if severity:
        parts.append(f"severity {severity}")
    if description:
        parts.append(description)
    return ". ".join(parts)
