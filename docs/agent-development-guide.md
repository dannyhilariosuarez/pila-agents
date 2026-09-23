# Agent Development Guide

This guide covers how to build, register, and monetize agents for the pila platform.

---

## Overview

pila is an autonomous agent registry. When a user submits a task, pila decomposes it into sub-tasks and routes each to the best-fit agent. Agents are interchangeable, scoreable, and replaceable units of work.

There are two ways to build an agent:

1. **CLI agent (TypeScript)** — extend `PilaBaseAgent`, register via CLI, runs in-process
2. **Remote HTTP agent (any language)** — expose a `POST /execute` endpoint, register via CLI with a manifest

Both paths register into the same Supabase registry. The orchestrator treats them identically.

---

## 1. The Agent Contract

Every agent implements the `PilaAgent` interface from `@pila/protocol`:

```typescript
interface PilaAgent {
  manifest: PilaAgentManifest;
  execute(input: PilaInputSchema): Promise<PilaOutputSchema>;
  validate(input: PilaInputSchema): boolean;
  healthCheck(): Promise<boolean>;
}
```

### Input

```typescript
interface PilaInputSchema {
  task: string; // Original user request
  subTask: string; // Specific sub-task for this agent
  context?: string;
  parameters?: Record<string, unknown>;
}
```

### Output

Every agent must return `PilaOutputSchema`:

```typescript
interface PilaOutputSchema {
  success: boolean;
  data: Record<string, unknown>; // Structured result data
  summary: string; // Human-readable summary
  confidence: number; // 1.0 = real API data, 0.5 = AI-generated
  sources?: string[]; // Data source URLs
  executionTime: number; // Milliseconds (auto-filled by base class)
  error?: string; // Error message if failed
}
```

### Manifest

Every agent declares a manifest that the registry uses for discovery, scoring, and autonomous routing:

```typescript
interface PilaAgentManifest {
  id: string; // Unique slug: "flight-search-agent"
  name: string; // Display name: "Flight Search Agent"
  version: string; // Semver: "1.0.0"
  author: string; // Developer name
  description: string; // Used by Claude for scoring — be specific
  category: PilaCategory; // See categories below
  capabilities: string[]; // Used by Claude for scoring — be specific
  pricing: { perExecution: number; currency: string };
  tags: string[];
  inputSchema: PilaInputSchema;
  outputSchema: PilaOutputSchema;
  endpoint?: string; // Remote HTTP agent URL (optional)
}
```

**Categories**: `Research | Finance | Legal | Media | Marketing | Operations | Technical | Communications | Travel | RealEstate`

The `description` and `capabilities` fields are critical. Claude reads them when deciding which agent to route a sub-task to. Be specific and descriptive.

---

## 2. Building a CLI Agent (TypeScript)

### Project structure

```
agents/
  my-agent/
    index.ts            # Agent class
    index.test.ts       # Unit tests
    manifest.ts         # Agent manifest
    register.ts         # Registration script
    package.json
    tsconfig.json
    .env                # API keys (gitignored)
    .env.example        # Documents required keys (committed)
```

### package.json

```json
{
  "name": "@pila/my-agent",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "register": "pnpm --filter @pila/cli start agent register agents/my-agent/dist"
  },
  "dependencies": {
    "@pila/protocol": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

### Agent implementation

```typescript
import { PilaBaseAgent } from "@pila/protocol";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";

export class MyAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = {
    id: "my-agent",
    name: "My Agent",
    version: "1.0.0",
    author: "your-name",
    description: "Searches for restaurant reviews and ratings using Yelp API",
    category: "Research",
    capabilities: [
      "restaurant search",
      "review aggregation",
      "rating comparison",
      "cuisine filtering",
    ],
    pricing: { perExecution: 0.05, currency: "USD" },
    tags: ["restaurants", "reviews", "food"],
    inputSchema: { task: "", subTask: "" },
    outputSchema: {
      success: true,
      data: {},
      summary: "",
      confidence: 0,
      executionTime: 0,
    },
  };

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    // Call your real API
    const results = await this.searchRestaurants(input.subTask);

    return {
      success: true,
      data: { restaurants: results },
      summary: `Found ${results.length} restaurants matching your criteria`,
      confidence: 1.0, // 1.0 because this uses real API data
      executionTime: 0, // Auto-filled by PilaBaseAgent
      sources: ["https://api.yelp.com"],
    };
  }

  private async searchRestaurants(query: string) {
    // Your API integration here
    return [];
  }
}
```

### Key points

- **Extend `PilaBaseAgent`**, not `PilaAgent` directly. The base class provides execution timing, error handling, and logging.
- **Implement `run()`**, not `execute()`. The base class wraps `run()` with timing and error handling.
- **Set `confidence: 1.0`** when returning real API data. Use `0.5` for AI-generated content.
- **Export the class** as a named export. The CLI looks for constructable classes with a `manifest` property.

### API key management

Agents are self-configuring. Each agent loads its own `.env` file from its directory — the orchestrator does not inject keys.

**Priority order**: constructor-injected keys > `process.env` (loaded from the agent's `.env`)

```typescript
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";

export class MyAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = {
    /* ... */
  };

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url); // loads .env from this file's directory
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    const apiKey = this.getApiKey("MY_API_KEY"); // throws if not set
    // ...
  }
}
```

Create a `.env` file in your agent's directory with the required keys:

```
MY_API_KEY=your-key-here
```

Create a `.env.example` file (committed to git) documenting which keys are needed:

```
MY_API_KEY=
```

For **testing**, pass keys via constructor injection to avoid needing a real `.env`:

```typescript
const agent = new MyAgent({ apiKeys: { MY_API_KEY: "test-key" } });
```

The `dotenv` dependency is provided by `@pila/protocol` — agents do not need to add it to their own `package.json`.

### Build and register

```bash
cd agents/my-agent
pnpm build
cd ../..
pnpm agent:register agents/my-agent/dist
```

The CLI will:

1. Import the module and find the `PilaAgent` class
2. Validate the manifest
3. Run the agent's `healthCheck()`
4. Upsert the agent into the Supabase registry

The orchestrator discovers new agents within 60 seconds via its registry refresh cycle.

---

## 3. Building a Remote HTTP Agent (Any Language)

Remote agents expose a single HTTP endpoint that conforms to the pila execution contract.

### Endpoint contract

```
POST /execute
Content-Type: application/json

Request:
{
  "task": "Plan a 5-day trip to Tokyo from NYC",
  "subTask": "Search for round-trip flights JFK to NRT in April"
}

Response:
{
  "success": true,
  "data": { "flights": [...] },
  "summary": "Found 12 flights from JFK to NRT...",
  "confidence": 1.0,
  "executionTime": 2340,
  "sources": ["https://flights-api.example.com"]
}
```

### Create a manifest file

Save as `manifest.json`:

```json
{
  "id": "my-remote-agent",
  "name": "My Remote Agent",
  "version": "1.0.0",
  "description": "Searches for hotel availability and pricing across major booking platforms",
  "author": "your-name",
  "capabilities": [
    "hotel search",
    "price comparison",
    "availability checking",
    "room type filtering"
  ],
  "tags": ["hotels", "accommodation", "booking"],
  "inputSchema": {
    "task": "string",
    "subTask": "string"
  },
  "outputSchema": {
    "success": "boolean",
    "data": "object",
    "summary": "string",
    "confidence": "number",
    "executionTime": "number"
  }
}
```

### Register

```bash
pnpm agent:register \
  --endpoint https://my-service.com/execute \
  --manifest ./manifest.json \
  --category Travel
```

This registers the agent via the orchestrator's `POST /developers/register` endpoint, which requires a developer API key. Set `PILA_API_KEY` in your environment before running it. The orchestrator will call your endpoint whenever a sub-task matches your agent's capabilities.

### Python example (FastAPI)

```python
from fastapi import FastAPI
import time

app = FastAPI()

@app.post("/execute")
async def execute(body: dict):
    start = time.time()
    task = body.get("task", "")
    sub_task = body.get("subTask", "")

    # Your logic here
    results = await search_hotels(sub_task)

    return {
        "success": True,
        "data": {"hotels": results},
        "summary": f"Found {len(results)} hotels",
        "confidence": 1.0,
        "executionTime": int((time.time() - start) * 1000),
        "sources": ["https://hotels-api.example.com"],
    }
```

### Requirements for remote agents

- Must respond within **30 seconds** (orchestrator timeout)
- Must return valid `PilaOutputSchema` JSON
- Must be publicly accessible (HTTPS recommended)
- Should handle errors gracefully and return `{ "success": false, "error": "..." }`

---

## 4. Using the Python SDK to Build Agents

The Python SDK at `sdks/python/` provides a `PilaBaseAgent` class:

```python
from pila import PilaBaseAgent

class HotelSearchAgent(PilaBaseAgent):
    name = "hotel-search-agent"
    version = "1.0.0"
    description = "Searches for hotel availability and pricing"
    capabilities = ["hotel search", "price comparison", "availability"]
    tags = ["hotels", "travel"]

    async def run(self, task: str, sub_task: str) -> dict:
        results = await self.search_hotels(sub_task)
        return {
            "success": True,
            "data": {"hotels": results},
            "summary": f"Found {len(results)} hotels",
            "confidence": 1.0,
        }

    async def search_hotels(self, query: str) -> list:
        # Your API integration
        return []

# Register with the orchestrator
agent = HotelSearchAgent()
agent.register(base_url="https://pila-orchestrator.fly.dev")
```

See `docs/sdk-guide.md` for full SDK documentation.

---

## 5. CLI Reference

All CLI commands are available via pnpm scripts:

```bash
# Register a local TypeScript agent
pnpm agent:register agents/my-agent

# Register a remote HTTP agent
pnpm agent:register --endpoint https://my-service.com/execute --manifest ./manifest.json

# List all registered agents
pnpm agent:list

# Test an agent (health check + test execution)
pnpm agent:test <agent-id-or-name>

# View agent performance statistics
pnpm agent:stats <agent-id-or-name>

# Deactivate an agent
pnpm agent:remove <agent-id-or-name>

# Authenticate with the platform
pnpm agent:login
```

### Environment variables for CLI

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ORCHESTRATOR_URL=http://localhost:3000    # Default
PILA_API_KEY=...                         # For authentication
```

### Agent lookup

The CLI can find agents by:

1. Manifest ID (e.g., `flight-search-agent`)
2. Name substring (e.g., `flight`)
3. UUID

### Login

```bash
pnpm agent:login
```

This validates your `PILA_API_KEY` against the orchestrator and stores credentials at `~/.pila/credentials.json`.

---

## 6. Testing Your Agent

### Unit tests

Test your agent's `run()` method directly:

```typescript
import { describe, it, expect } from "vitest";
import { MyAgent } from "./index.js";

describe("MyAgent", () => {
  it("returns valid PilaOutputSchema", async () => {
    const agent = new MyAgent();
    const result = await agent.execute({
      task: "Find restaurants in NYC",
      subTask: "Search for Italian restaurants in Manhattan",
    });

    expect(result.success).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it("handles errors gracefully", async () => {
    const agent = new MyAgent();
    const result = await agent.execute({
      task: "",
      subTask: "",
    });

    // PilaBaseAgent catches errors and returns { success: false }
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("executionTime");
  });
});
```

### Integration test via CLI

```bash
pnpm agent:test my-agent
```

This command:

1. Looks up the agent in the registry
2. Prints the full manifest
3. Runs a health check
4. Sends a test payload and displays results

### Smoke test

With the orchestrator running, submit a task that should route to your agent:

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"task": "Find Italian restaurants in Manhattan", "userId": "test-user"}'
```

Check the SSE stream to confirm your agent was selected and executed:

```bash
curl -N http://localhost:3000/tasks/<task-id>/stream
```

---

## 7. How Routing Works

Understanding routing helps you write better manifests. There are zero hardcoded keyword lists. All routing decisions are made by Claude.

### Scoring

For each sub-task, Claude reads every candidate agent's `description` and `capabilities` fields, then returns a score from 0.0 to 1.0 with reasoning:

```
Flight Search Agent -> "Search for flights JFK to NRT" = 0.95 (perfect match)
Flight Search Agent -> "Calculate trip budget"          = 0.02 (wrong domain)
Budget Analyst      -> "Calculate trip budget"          = 0.91 (perfect match)
```

### Thresholds

- **Score >= 0.3**: Agent is selected for the sub-task
- **Score < 0.3**: Sub-task falls through to a raw Claude fallback

### Tips for high scores

1. **Be specific in `description`** — "Searches for real-time flight prices using Google Flights API" beats "Helps with flights"
2. **List concrete capabilities** — `["round-trip flight search", "price comparison", "airline filtering"]` beats `["flights"]`
3. **Use the right `category`** — Helps Claude narrow candidates
4. **Keep capabilities focused** — An agent that does one thing well scores higher than one that claims to do everything

---

## 8. Execution Paths

When your agent is matched to a sub-task, execution follows one of two paths:

### Real executor (CLI agents with code)

Your `run()` method is called directly. You have full control over the execution.

- `confidence: 1.0` — indicates real API data
- Appears as `hasRealExecutor: true` in the registry

### Inline Claude fallback (DB agents without code)

If you register an agent via the API or manifest but don't have a local executor, it will have no registered executor. When matched to a sub-task, it falls through to the inline Claude fallback in `execute.ts`, which uses Claude Sonnet with the sub-task description as context.

- `confidence: 0.5` — indicates AI-generated content
- Appears as `hasRealExecutor: false` in the registry
- Shows "AI Generated" badge in the UI

This means you can register an agent with just a manifest, and it will work immediately via Claude. Later, you can add a real executor to replace the fallback and get the "Verified Data" badge.

---

## 9. Revenue Sharing Model

Developers earn revenue when their agents execute tasks.

### Rates

| Tier               | Developer Share | Platform Share |
| ------------------ | --------------- | -------------- |
| Standard           | 70%             | 30%            |
| Founding Developer | 80%             | 20%            |

### Defaults

- Default execution fee: **$0.10** per agent execution
- Minimum payout threshold: **$10.00** (1000 cents)
- Payouts processed weekly

### How it works

1. Developer creates a billing account via `POST /billing/connect` with their Stripe Connect ID
2. Each time their agent executes, an `execution_charge` record is created
3. Revenue is split according to the developer's `revenue_share_rate`
4. Weekly, pending charges above the minimum threshold are batched into a `payout_summary`

### Check earnings

```bash
# Via CLI
pnpm agent:stats my-agent

# Via API
curl https://pila-orchestrator.fly.dev/billing/earnings/<developer-account-id>
```

Returns:

```json
{
  "totalEarned": 5000,
  "pendingPayout": 2100,
  "executionCount": 500
}
```

### Confidence scoring

Agent performance is tracked across executions:

```
confidence = (completion_rate * 0.35)
           + (schema_compliance * 0.25)
           + (latency_score * 0.15)
           + (conflict_free_rate * 0.15)
           + (user_feedback * 0.10)
```

Higher confidence scores lead to better routing priority.

---

## Example: Flight Search Agent

The existing `agents/flight-search/` is the reference implementation:

```typescript
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { flightSearchManifest } from "./manifest.js";

export class FlightSearchAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = flightSearchManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url); // loads agents/flight-search/.env
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    // Uses this.getApiKey("SERPAPI_KEY") — no process.env access
    // Calls SerpAPI Google Flights endpoint
    // Falls back to Tavily search if SerpAPI fails
    // Returns structured flight data with cheapest/fastest/recommended options
  }
}
```

Its `.env.example`:

```
SERPAPI_KEY=
TAVILY_API_KEY=
```

This agent:

- Is **self-configuring** — loads its own `.env`, no orchestrator changes needed
- Uses `this.getApiKey()` for all API keys (constructor-injected keys override `.env` for testing)
- Uses real API data (SerpAPI), so `confidence: 1.0`
- Has a Tavily fallback for resilience
- Returns structured data with `cheapest_option`, `fastest_option`, `recommended_option`
- Consistently scores 0.90+ when Claude routes flight-related sub-tasks
