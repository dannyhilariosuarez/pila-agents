# @pila/shared

Shared types, constants, and utilities used across [pila](https://github.com/dannyhilariosuarez/pila-agents) — task and agent lifecycle states, row types, versioning helpers, and the revenue-split calculation.

Most agent developers do not need this package. Build agents with [`@pila/protocol`](https://www.npmjs.com/package/@pila/protocol) instead. This one exists so the payout arithmetic and lifecycle contracts are inspectable rather than implied.

## Install

```bash
npm install @pila/shared
```

Requires Node.js 20 or newer. No runtime dependencies.

## Revenue split

Developers earn a share of every execution fee. The split is computed here, so you can check the arithmetic against what you are paid:

```ts
import {
  computeRevenueSplit,
  STANDARD_REVENUE_SHARE,
  FOUNDING_REVENUE_SHARE,
  MIN_PAYOUT_CENTS,
} from "@pila/shared";

const { developerShare, platformShare } = computeRevenueSplit(
  100,
  STANDARD_REVENUE_SHARE,
);
// developer 70c, platform 30c
```

The developer share is rounded to the nearest cent and the platform takes the remainder. `MIN_PAYOUT_CENTS` is the threshold below which earnings roll over to the next period.

## Lifecycle states

```ts
import { TaskStatus, AgentStatus } from "@pila/shared";

TaskStatus.Complete; // "complete"
AgentStatus.Hired; // "hired"
```

Each is a const object plus a matching union type, so the same name works in value and type position.

## Other exports

| Export                                                                        | What it is                              |
| ----------------------------------------------------------------------------- | --------------------------------------- |
| `AGENT_TIMEOUT_MS`, `MAX_CONCURRENT_AGENTS`, `DECOMPOSE_MAX_RETRIES`          | Execution limits                        |
| `computeRevenueSplit`, `DeveloperAccount`, `ExecutionCharge`, `PayoutSummary` | Billing                                 |
| Versioning helpers                                                            | Agent version comparison and management |
| Branded ID types                                                              | Nominal typing for entity identifiers   |
| `User`, `Task` and related row types                                          | Database record shapes                  |

## License

Apache-2.0. See [LICENSE](./LICENSE).
