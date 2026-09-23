# Pila Protocol Specification

> Version 0.1.0 — Agent-to-Agent (A2A) Compatible Communication Protocol

## Overview

The Pila protocol defines how agents register, receive tasks, and return results within the orchestrator ecosystem. It is designed for compatibility with emerging A2A (Agent-to-Agent) standards.

## Task Execution Contract

### POST /execute

Agents receive work via the execution contract:

**Request:**
```json
{
  "task": "string — the user's original natural-language request",
  "subTask": "string — the specific assignment for this agent"
}
```

**Response (PilaOutputSchema):**
```json
{
  "success": true,
  "data": { "...agent-specific structured data" },
  "summary": "Human-readable result summary (min 10 chars)",
  "confidence": 0.85,
  "executionTime": 1234,
  "sources": ["https://example.com"],
  "error": null
}
```

## Agent Manifest Schema

Every agent must declare a manifest conforming to `PilaAgentManifest`:

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "version": "1.0.0",
  "description": "What this agent does",
  "author": "developer-name",
  "capabilities": ["capability-1", "capability-2"],
  "tags": ["tag1", "tag2"],
  "inputSchema": {
    "task": "string",
    "subTask": "string"
  },
  "category": "Finance",
  "outputSchema": {
    "success": "boolean",
    "data": "object",
    "summary": "string",
    "confidence": "number (0-1)",
    "executionTime": "number (ms)"
  }
}
```

### Agent Categories

Every agent must declare exactly one of the 10 supported categories:

| Category | Description |
|----------|-------------|
| Research | Information gathering, analysis, and synthesis |
| Finance | Financial data, markets, and monetary analysis |
| Legal | Legal research, compliance, and regulatory guidance |
| Media | Content creation, media processing, and publishing |
| Marketing | Campaign strategy, audience analysis, and outreach |
| Operations | Workflow automation, logistics, and process management |
| Technical | Software engineering, infrastructure, and DevOps |
| Communications | Messaging, notifications, and inter-party correspondence |
| Travel | Trip planning, booking, and itinerary management |
| RealEstate | Property data, listings, and real estate transactions |

## I/O Interfaces

### PilaInputSchema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| task | string | yes | Original user request |
| subTask | string | yes | Specific assignment |

### PilaOutputSchema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| success | boolean | yes | Whether execution succeeded |
| data | object | yes | Structured result data |
| summary | string | yes | Human-readable summary |
| confidence | number | yes | Self-reported confidence (0-1) |
| executionTime | number | yes | Wall-clock time in ms |
| sources | string[] | no | Data source URLs |
| error | string | no | Error message if failed |

## Agent Lifecycle

1. **Registration** — Agent manifest is validated and stored in the registry
2. **Discovery** — Orchestrator queries registry for capable agents
3. **Routing** — Claude AI scores candidates and selects best match
4. **Execution** — Agent receives task via execution contract
5. **Scoring** — Confidence score updated based on outcome

## A2A Compatibility Notes

The Pila protocol aligns with A2A conventions:

- **Agent Card** — The manifest serves as the Agent Card, declaring capabilities and metadata
- **Task Lifecycle** — Tasks follow submitted -> working -> completed/failed states
- **Structured Output** — All responses use typed JSON schemas
- **Discovery** — The `/registry` endpoint serves as the agent discovery mechanism
- **Streaming** — SSE events follow the A2A streaming pattern for real-time updates

## Confidence Scoring Formula

```
confidence = (completion_rate * 0.35)
           + (schema_compliance * 0.25)
           + (latency_score * 0.15)
           + (conflict_free_rate * 0.15)
           + (user_feedback * 0.10)
```

Scores are recalculated every 10 executions (first 100) then every 50 executions.

## Security

- Rate limiting: 60 requests/minute per IP (token bucket)
- Request ID tracing via X-Request-Id header
- Content-hash deduplication prevents duplicate task processing
- Input validation via Zod schemas on all endpoints
