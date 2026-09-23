# ADR 002: Claude-Driven Agent Routing (Zero Hardcoded Keywords)

## Status
Accepted

## Context
Agent routing (matching sub-tasks to agents) could be done via keyword lists, embedding similarity, or LLM-based scoring. Keyword lists are fast but brittle and require manual maintenance. Embeddings are good but require infrastructure (pgvector, embedding models).

## Decision
Use Claude Haiku for batch agent routing. The full agent catalog (manifests, capabilities, descriptions) is sent to Haiku, which returns the best match index for each sub-task.

A lightweight vector similarity pre-filter (bag-of-words TF-IDF) narrows the candidate set to save tokens before sending to Haiku.

## Consequences
- **Positive**: Zero hardcoded keyword lists. New agents work immediately without routing code changes. Haiku is fast (~200ms) and cheap. The pre-filter reduces token costs for large catalogs.
- **Negative**: Each routing call costs API tokens. Routing quality depends on manifest descriptions. Cold starts may be slower if the catalog is large.
- **Tradeoffs**: We accept the per-call cost because routing accuracy is critical and maintaining keyword lists doesn't scale. The vector pre-filter mitigates token cost.
