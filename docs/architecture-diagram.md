# pila Architecture Diagram

## System Overview

pila is an autonomous agent registry that takes a single natural-language request, decomposes it into specialized sub-tasks, routes each to the best available AI agent or declarative tap, and streams live progress back to the user. The system is built as a TypeScript monorepo with three apps, four internal packages, and a pluggable agent layer.

```
                          USER ENTRY POINTS
                 +-------------------------------+
                 |                               |
          +------+------+              +---------+---------+
          |  Slack DM   |              |   Web Dashboard   |
          | (Bolt 4.2)  |              | (React 19 + Vite) |
          +------+------+              +---------+---------+
                 |                               |
                 |  Intent Classification        |  HTTP POST
                 |  (Haiku 4.5)                  |
                 |                               |
                 +----------- + ----------------+
                               |
                               v
                 +-----------------------------+
                 |       ORCHESTRATOR          |
                 |       (Hono 4.7 API)        |
                 |-----------------------------|
                 |                             |
                 |  1. Decompose               |
                 |     Claude Sonnet breaks    |
                 |     request into sub-tasks  |
                 |                             |
                 |  2. Route                   |
                 |     Registry scores agents  |
                 |     per sub-task (Haiku)    |
                 |                             |
                 |  3. Execute                 |
                 |     Run agents concurrently |
                 |     (max 5, 30s timeout)    |
                 |     Taps via ManifestExec.  |
                 |                             |
                 |  4. Stream                  |
                 |     SSE events to clients   |
                 +------+----------+-----------+
                        |          |
           +------------+          +------------+
           |                                    |
           v                                    v
+----------+-----------+           +------------+-----------+
|   AGENT REGISTRY     |           |     SUPABASE           |
|   (packages/registry)|           |     (PostgreSQL)       |
|----------------------|           |------------------------|
| Score & rank agents  |           | users                  |
| Keyword + tag match  |           | agents (16 TS + taps)  |
| Category boost       |           | tasks (Runs)           |
| Min threshold: 0.3   |           | task_agents            |
+----------+-----------+           | heartbeats (Watches)   |
           |                       | installations          |
           v                       | developer_accounts     |
                                   | execution_charges      |
                                   | payout_summaries       |
                                   | agent_executions       |
                                   | agent_conflicts        |
                                   | task_feedback          |
                                   +------------------------+
+---------------------------------------------+
|              AGENT LAYER                     |
|---------------------------------------------|
|                                             |
|  Built-in Executors (real code)              |
|  +-------------------+                       |
|  | FlightSearchAgent |  4 agents with real   |
|  | HotelSearchAgent  |  API integrations     |
|  | PropertyDataAgent |  confidence: 1.0      |
|  | MarketDataAgent   |                       |
|  +-------------------+                       |
|                                              |
|  DB Agents (no executor)                     |
|  +-------------------+                       |
|  | 12 manifests      |  Handled by inline    |
|  | No executor       |  Claude fallback in   |
|  | registered        |  execute.ts           |
|  | confidence: 0.5   |  "AI Generated" badge |
|  +-------------------+                       |
|                                              |
|  Tap Manifests (JSON-only)                   |
|  +-------------------+                       |
|  | Declared via      |  Executed by           |
|  | tap.json upload   |  ManifestExecutor      |
|  | No hosted endpoint|  (Haiku planning +     |
|  | tap_type: 'tap'   |   HTTP calls)          |
|  +-------------------+                       |
|                                              |
|  All produce -> PilaOutputSchema             |
|  { success, data, summary, confidence,       |
|    sources, executionTime }                   |
+---------------------------------------------+

                  AI MODELS
      +-------------------------------+
      |  Claude Sonnet 4              |
      |  - Task decomposition         |
      |  - Agent execution (fallback) |
      |  - Flight route parsing       |
      +-------------------------------+
      |  Claude Haiku 4.5             |
      |  - Intent classification      |
      |  - Agent routing/scoring      |
      |  - Tap manifest execution     |
      |    (ManifestExecutor)         |
      +-------------------------------+
```

## Data Flow: Request to Results

```
User Input
  "Find me flights from NYC to Miami next Friday under $300"
    |
    v
[1] INTENT CLASSIFICATION (Haiku 4.5)
    Classify as: run | watch | management | unclear
    Result: "run"
    |
    v
[2] TASK CREATION
    POST /tasks -> Supabase tasks table
    Status: "processing"
    |
    v
[3] DECOMPOSITION (Sonnet)
    Break into sub-tasks:
      - "Search for flights JFK to MIA"
      - "Compare pricing options"
      - "Analyze travel logistics"
    |
    v
[4] AGENT ROUTING (Registry + Haiku)
    For each sub-task, score all agents and taps:
      Flight Search Agent = 0.95  <-- winner (real executor)
      Budget Analyst      = 0.12  <-- wrong domain
    |
    v
[5] CONCURRENT EXECUTION
    Run matched agents in parallel (max 5 at once)
    Each agent returns PilaOutputSchema
    Taps executed via ManifestExecutor (Haiku planning + declared HTTP calls)
    30-second timeout per agent
    |
    v
[6] SSE STREAMING
    Events pushed to connected clients:
      task:status  -> { status: "processing" }
      agent:status -> { name: "Flight Search Agent", status: "running" }
      agent:status -> { name: "Flight Search Agent", status: "complete", output: "..." }
      done         -> { status: "complete" }
    |
    v
[7] RESULT DELIVERY
    - Slack: formatted blocks in thread + share button
    - Web: live agent feed + result cards at /r/{taskId}
```

## Internal Package Dependencies

```
apps/orchestrator
  |-- packages/protocol   (PilaBaseAgent, manifest types)
  |-- packages/registry   (scoreAgent, rankAgents, matchAgentToSubTask)
  |-- packages/shared      (DB types: Task, Agent, TaskAgent, etc.)

apps/agent (Slack)
  |-- packages/shared

apps/web (React)
  |-- (consumes SSE stream from orchestrator)

packages/cli
  |-- packages/protocol
  |-- packages/shared
```

## Resilience & Observability Layer

```
+---------------------------------------------+
|           RESILIENCE INFRASTRUCTURE          |
|---------------------------------------------|
|                                             |
|  Circuit Breakers     Retry with Jitter     |
|  +------------------+ +------------------+ |
|  | supabaseBreaker  | | withRetry<T>()   | |
|  | anthropicBreaker | | decorrelated     | |
|  | remoteAgent...   | | jitter, max 3    | |
|  | CLOSED→OPEN→HALF | +------------------+ |
|  +------------------+                       |
|                                             |
|  Event Bus              Webhook Verification|
|  +------------------+  +------------------+ |
|  | 11 domain events |  | HMAC-SHA256      | |
|  | wildcard support |  | timingSafeEqual  | |
|  | async handlers   |  | replay protect   | |
|  +------------------+  +------------------+ |
+---------------------------------------------+

          OBSERVABILITY
+---------------------------------------------+
| OpenTelemetry Tracing (optional)            |
| Prometheus Metrics (GET /metrics)           |
| Structured Request Logging (pino + req ID)  |
| Per-output-type Contradiction Detection     |
+---------------------------------------------+
```

## Key Design Decisions

- **Manifest-driven discovery**: Agents self-describe via `PilaAgentManifest`. The registry uses manifests for autonomous scoring -- zero hardcoded keyword lists.
- **Progressive enhancement**: Agents with real executors return verified data (confidence 1.0). Agents without executors fall through to an inline Claude fallback in `execute.ts` (confidence 0.5, "AI Generated" badge). When a real executor is built, it slots in seamlessly.
- **Protocol consistency**: Both real executors and inline Claude fallback produce results through the same pipeline, making the execution path invisible to consumers.
- **Dual-model AI**: Haiku handles fast, cheap decisions (intent classification, routing). Sonnet handles complex work (decomposition, agent execution).
- **Circuit breaker protection**: External calls (Supabase, Anthropic, remote agents) are wrapped in circuit breakers that fail fast when downstream services are unhealthy.
- **Typed retry with jitter**: Transient failures are retried with decorrelated jitter to prevent thundering herd effects.
- **Five-constraint decomposition**: Sub-tasks are validated for action verbs, category enum, expected output type, dependency cycle detection (Kahn's algorithm), and JSON-only cleaning.
- **Per-output-type contradiction rules**: Conflict detection uses configurable thresholds per output type (e.g., FlightList prices ±30%, MarketData prices ±5%).
- **Two-tier participation**: Full agents (hosted endpoints, custom code) and taps (JSON manifests, ManifestExecutor) share the same registry, scoring, and output schema.
