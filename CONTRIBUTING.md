# Contributing to pila

## Setup

```bash
# Prerequisites: Node.js >= 22, pnpm 9.15+
git clone <repo-url> && cd pila
pnpm install
cp .env.example .env   # Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
pnpm dev               # Starts orchestrator, agent, and web dashboard
```

## Architecture

pila is a TypeScript monorepo (pnpm workspaces + Turborepo):

```
apps/
  orchestrator/   Hono API — decomposition, agent routing, execution, SSE
  agent/          Slack Bolt app — DM handling, intent classification
  web/            React dashboard — live agent feed, result cards

packages/
  protocol/       Agent interface (PilaBaseAgent, manifest types)
  registry/       Agent scoring and ranking
  shared/         Database types, status enums, constants
  cli/            CLI for agent management
```

### Key data flow

1. User sends task via Slack DM or web chat
2. Orchestrator decomposes into sub-tasks (Claude)
3. Registry matches sub-tasks to agents (Claude Haiku batch call)
4. Agents execute concurrently with timeout + concurrency limit
5. Results stream via SSE to Slack thread and web dashboard

## Agent Development

Every agent implements the `PilaAgent` interface from `@pila/protocol`:

```typescript
import { PilaBaseAgent } from "@pila/protocol";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";

class MyAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = {
    id: "my-agent",
    name: "My Agent",
    version: "1.0.0",
    author: "you",
    description: "What this agent does",
    category: "Research",
    capabilities: ["keyword1", "keyword2"],
    pricing: { perExecution: 0, currency: "USD" },
    tags: ["tag1"],
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
    // Your implementation — call real APIs, process data, etc.
    return {
      success: true,
      data: { result: "..." },
      summary: "What happened",
      confidence: 1.0, // 1.0 for real data, 0.5 for AI-generated
      executionTime: 0, // auto-filled by base class
    };
  }
}
```

Register via CLI:

```bash
pnpm agent:register agents/my-agent
pnpm agent:test my-agent
```

See [`docs/agent-development-guide.md`](./docs/agent-development-guide.md) for the full guide.

## Testing

```bash
pnpm test              # Run all unit tests (vitest, 792 tests across 80 files)
pnpm test:coverage     # Run with coverage thresholds enforced
pnpm test:smoke        # E2E smoke test against running orchestrator
pnpm test:load         # k6 load testing
```

Tests live alongside source files (`*.test.ts`). Key test areas:

- `packages/registry/src/index.test.ts` — scoring and ranking
- `packages/protocol/src/base.test.ts` — base agent execution
- `apps/orchestrator/src/lib/decompose.test.ts` — JSON parsing
- `apps/orchestrator/src/lib/claudeFallback.test.ts` — fallback parsing

### Coverage thresholds

Coverage is enforced in CI via `vitest.config.ts`:

| Metric     | Threshold |
| ---------- | --------- |
| Lines      | 70%       |
| Branches   | 60%       |
| Functions  | 65%       |
| Statements | 70%       |

See [`docs/testing-guide.md`](./docs/testing-guide.md) for full testing strategy.

## Code Style

- TypeScript strict mode, ES2024 target, `noUncheckedIndexedAccess` enabled
- ESLint with strict rules (`no-explicit-any: error`, `no-non-null-assertion: error`, `consistent-type-imports: error`)
- Prettier for formatting (2-space indent, double quotes, trailing commas)
- Structured logging via pino (never `console.log` in orchestrator or web app)
- Zod validation on all API inputs and environment variables
- All routing decisions made by Claude (zero hardcoded keyword lists)

### Pre-commit hooks

Husky runs lint-staged on every commit:

- `*.{ts,tsx}` — `eslint --fix` + `prettier --write`
- `*.{json,md,yaml,yml}` — `prettier --write`

### Environment variables

All orchestrator env vars are validated at startup via a centralized Zod schema in `apps/orchestrator/src/lib/env.ts`. Add new variables there first, then use the typed `env` object instead of `process.env`.

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. **Lint** — `pnpm lint` (ESLint with strict rules)
2. **Type check** — `tsc --noEmit` (full TypeScript validation)
3. **Build** — `pnpm build` (Turborepo parallel build)
4. **Test** — `pnpm test:coverage` (vitest with coverage thresholds)
5. **Smoke test** — `pnpm test:smoke` (allowed to fail without server)

## Commit Messages

Follow conventional commits:

```
feat(scope): description
fix(scope): description
test: description
docs: description
refactor(scope): description
chore(scope): description
```

## Pull Requests

- Branch from `main`, PR back to `main`
- All CI checks must pass
- CODEOWNERS will auto-assign reviewers based on file paths
- Keep PRs focused — one feature or fix per PR

## Key Documentation

- [`docs/api-reference.md`](./docs/api-reference.md) — Full API docs
- [`docs/architecture-diagram.md`](./docs/architecture-diagram.md) — System architecture
- [`docs/deployment-guide.md`](./docs/deployment-guide.md) — Production deployment
- [`docs/protocol-spec.md`](./docs/protocol-spec.md) — Agent protocol spec
- [`docs/troubleshooting.md`](./docs/troubleshooting.md) — Common issues
