# @pila/protocol

The agent protocol for [pila](https://github.com/dannyhilariosuarez/pila-agents) — the base class, manifest types, and registration client that every pila agent is built on.

Registration goes through the registry's HTTP API with a developer API key. This package never touches a database and holds no platform credentials.

## Install

```bash
npm install @pila/protocol
```

Requires Node.js 20 or newer.

## Build an agent

Extend `PilaBaseAgent` and implement `run()`. The base class handles execution timing, structured error handling, and API key resolution.

```ts
import { PilaBaseAgent } from "@pila/protocol";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";

export class WeatherAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = {
    id: "weather-lookup",
    name: "Weather Lookup",
    version: "1.0.0",
    author: "you",
    description: "Current conditions for a city",
    category: "Research",
    capabilities: ["weather", "forecast"],
    tags: ["weather"],
    inputSchema: { task: "string", subTask: "string" },
    outputSchema: {
      success: true,
      data: {},
      summary: "",
      confidence: 1,
      executionTime: 0,
    },
    pricing: { perExecution: 0.01, currency: "USD" },
  };

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    const key = this.getApiKey("WEATHER_API_KEY");
    // ...call your API, then return a structured result
    return {
      success: true,
      data: { tempC: 18 },
      summary: "18°C and clear",
      confidence: 0.9,
      executionTime: 0, // execute() fills this in
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
```

`execute()` wraps `run()`: it times the call, catches throws, and returns a well-formed `PilaOutputSchema` either way. Call `execute()`, not `run()`.

## Register it

```ts
import { registerAgent } from "@pila/protocol";

const result = await registerAgent(new WeatherAgent(), {
  registryUrl: "https://your-registry.example.com",
  apiKey: process.env.PILA_API_KEY,
});

if (!result.success) {
  console.error(result.errors);
}
```

`registerAgent` validates the manifest and runs the agent's health check before making any network call, then POSTs to `/developers/register`.

Both options fall back to the environment, so `registerAgent(agent)` alone works when these are set:

| Variable            | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `PILA_API_KEY`      | Developer API key. Required.                         |
| `PILA_REGISTRY_URL` | Registry base URL. Falls back to `ORCHESTRATOR_URL`. |

## Taps

A tap is a declarative JSON manifest — a tool with no code to host. `validateTapJson` checks one before you submit it, and `ManifestExecutor` runs it.

```ts
import { validateTapJson } from "@pila/protocol";

const result = validateTapJson(JSON.parse(raw));
if (!result.valid) console.error(result.errors);
```

## Exports

| Export                                       | What it is                                        |
| -------------------------------------------- | ------------------------------------------------- |
| `PilaBaseAgent`                              | Abstract base class for agents                    |
| `registerAgent`                              | Validate, health-check, and register over HTTP    |
| `ClaudeFallbackAgent`                        | Inline Claude execution for agents without a host |
| `ManifestExecutor`                           | Executes a declarative tap manifest               |
| `validateTapJson`                            | Validates a `tap.json` document                   |
| `PilaAgentManifest`, `PilaAgent`             | Agent metadata and interface types                |
| `PilaInputSchema`, `PilaOutputSchema`        | I/O contract types                                |
| `PilaCategory`, `PilaPricing`, `AgentConfig` | Supporting types                                  |
| `TapJson`, `TapTool`, `TapValidationError`   | Tap types                                         |

## License

Apache-2.0. See [LICENSE](./LICENSE).
