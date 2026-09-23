# pila agents

The open protocol for building agents and taps that a [pila](https://github.com/dannyhilariosuarez/pila-agents) registry can discover, score, and hire at runtime.

**pila** is Spanish for *battery* and for *stack*. A registry decomposes a request into sub-tasks and hires a specialist for each one. This repository holds everything you need to be one of those specialists — the protocol, the SDKs, the CLI, and working reference agents. The orchestrator that does the hiring is a separate, source-available project.

## Two ways to be hireable

**A tap** is a JSON file. No code, no hosting — you declare the tool and the registry executes it.

```json
{
  "id": "weather-lookup",
  "name": "Weather Lookup",
  "description": "Current conditions for a city",
  "category": "Research",
  "tags": ["weather"],
  "capabilities": ["weather"],
  "tools": [
    {
      "name": "current",
      "description": "Fetch current weather",
      "url": "https://api.example.com/weather?city={city}",
      "method": "GET"
    }
  ]
}
```

**An agent** is code you host, for anything a tap can't express.

```ts
import { PilaBaseAgent } from "@pila/protocol";

export class WeatherAgent extends PilaBaseAgent {
  manifest = {
    /* id, version, category, capabilities, pricing, ... */
  };

  async run(input) {
    return {
      success: true,
      data: { tempC: 18 },
      summary: "18°C and clear",
      confidence: 0.9,
      executionTime: 0,
    };
  }

  async healthCheck() {
    return true;
  }
}
```

Either way, you register once and any orchestrator speaking this protocol can hire you.

## Packages

| Package | What it is |
| --- | --- |
| [`@pila/protocol`](packages/protocol) | Base class, manifest types, tap schema, registration client |
| [`@pila/cli`](packages/cli) | Register, test, inspect, and deactivate your agents |
| [`@pila/shared`](packages/shared) | Lifecycle constants and the revenue-split calculation |
| [`pila-sdk`](sdks/python) | The same protocol for Python |

## Reference agents

Nine working agents live in [`agents/`](agents) — flight and hotel search, property and market data, and five GitHub agents. They are real implementations, not toys: read one before writing your own.

## Quick start

```bash
pnpm install
pnpm test          # builds the workspace first, then runs 229 tests

export PILA_API_KEY=your-key
export PILA_REGISTRY_URL=https://your-registry.example.com

pnpm --filter @pila/cli build
node packages/cli/dist/index.js agent register ./agents/flight-search
```

Registration goes over HTTP with a developer API key. Nothing in this repository holds database credentials or talks to a database.

## Documentation

- [Protocol specification](docs/protocol-spec.md) — the contract
- [Agent development guide](docs/agent-development-guide.md) — building and hosting an agent
- [Python SDK guide](docs/sdk-guide.md)
- [OpenAPI spec](docs/openapi.yaml) — the registry endpoints this protocol calls
- [Architecture decisions](docs/adr) — why the protocol looks the way it does

## Contributing

New agents and taps are the most useful contribution. See [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The orchestrator, registry scoring, and hosted platform are source-available under BUSL-1.1 in a separate repository.
