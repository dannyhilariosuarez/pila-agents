# ADR 004: Dual-Model AI Strategy (Haiku + Sonnet)

## Status
Accepted

## Context
The orchestrator uses Claude for multiple purposes: task classification, decomposition, agent routing, and agent execution. Using Sonnet for everything is expensive and slow. Using Haiku for everything produces lower quality decompositions.

## Decision
Split AI workload across two models:

- **Claude Haiku 4.5**: Fast, cheap decisions — intent classification, task complexity classification, agent routing/scoring, simple single-subtask generation
- **Claude Sonnet 4**: Complex work — full multi-subtask decomposition, agent execution (fallback mode), web search tool use

The complexity classifier (Haiku) determines which decomposition path to take, saving Sonnet calls for simple tasks.

## Consequences
- **Positive**: Simple tasks (60-70% of traffic) are processed entirely by Haiku, reducing cost by ~10x and latency by ~3x. Complex tasks still get full Sonnet quality.
- **Negative**: Two models to manage and version. Classification errors can send complex tasks down the simple path (mitigated by defaulting to complex on ambiguous results).
- **Tradeoffs**: The cost savings and latency improvements far outweigh the added complexity of the classification step.
