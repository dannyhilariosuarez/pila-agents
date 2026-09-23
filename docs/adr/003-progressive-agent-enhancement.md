# ADR 003: Progressive Agent Enhancement (Inline Claude Fallback)

## Status

Accepted (updated: removed ClaudeFallbackAgent registration in agentLoader)

## Context

We need agents to work immediately when registered (via manifest only) while also supporting custom executors with real API integrations. The two modes should produce results through the same pipeline so consumers don't need to differentiate.

## Decision

Agents with real executors (built-in TypeScript classes or remote HTTP endpoints) are registered in the agentLoader and execute directly. Agents without executors are **not** registered as fake executors — instead, they fall through to the inline Claude fallback in `execute.ts`, which correctly returns `usedRealExecutor: false` ("AI Generated" badge).

- **Real executor**: confidence 1.0, real API data, "Verified Data" badge
- **Inline Claude fallback**: confidence 0.5, AI-generated responses, "AI Generated" badge

Previously, agents without code were wrapped in `ClaudeFallbackAgent` and registered as executors, which incorrectly marked them as `usedRealExecutor: true`. This was removed to ensure the badge accurately reflects the data source.

## Consequences

- **Positive**: The "Verified Data" / "AI Generated" badge accurately reflects whether real API data was used. Developers can incrementally upgrade from AI fallback to real API integrations.
- **Negative**: Fallback agents may produce hallucinated data. The UI must clearly communicate the difference.
- **Tradeoffs**: We accept lower-confidence fallback results because having coverage for every category is more valuable than having no result at all. The confidence score and badge transparently communicate result quality.
