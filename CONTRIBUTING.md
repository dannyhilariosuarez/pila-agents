# Contributing

The most useful contribution is a new agent or tap. Protocol changes are welcome too, but they move slowly by design — other people's agents depend on the contract.

## Setup

```bash
# Prerequisites: Node.js >= 20, pnpm 9.15+
git clone https://github.com/dannyhilariosuarez/pila-agents && cd pila-agents
pnpm install
pnpm test          # builds the workspace, then runs the suite
```

No database, no API keys, and no running registry are needed to build or test this repository. Individual agents need their own third-party keys to *run* — each one ships a `.env.example` listing which.

For the Python SDK:

```bash
cd sdks/python
pip install -e ".[dev]"
pytest -q
```

## Layout

```
packages/
  protocol/   Base class, manifest and tap types, HTTP registration
  cli/        Register, test, inspect, and deactivate agents
  shared/     Lifecycle constants and the revenue-split calculation
sdks/python/  The same protocol for Python
agents/       Nine reference agents
taps/         Example tap manifests
docs/         Protocol spec, OpenAPI spec, guides, ADRs
```

The orchestrator that hires these agents lives in a separate, source-available repository. Nothing here talks to a database; registration goes over HTTP with a developer API key.

## Adding an agent

1. Copy the closest existing agent in `agents/` — `flight-search` for an API-backed agent, `github-issues` for a token-authenticated one.
2. Extend `PilaBaseAgent` and implement `run()` and `healthCheck()`. Return a structured `PilaOutputSchema` rather than throwing; `execute()` wraps `run()` with timing and error handling.
3. Declare every third-party key in `.env.example`. **Never commit a real `.env`.**
4. Write tests. `manifest.test.ts` checks the manifest is well-formed; `index.test.ts` covers behaviour with the network mocked.

## Adding a tap

A tap is a JSON manifest with no code to host. Start from `taps/tap.example.json` and validate it before submitting:

```ts
import { validateTapJson } from "@pila/protocol";
```

## Tests

Write the test first and watch it fail. A test that passes the moment you write it has proved nothing — you never saw it catch the bug.

Mock the network, never the thing you are testing. Agents must pass with no credentials present, so CI can run them.

```bash
pnpm test              # everything
pnpm vitest run <path> # one file
pnpm lint
pnpm type-check
```

## Pull requests

- One concern per PR.
- Say what you verified and paste the output. "Tests pass" without the run is not evidence.
- Explain *why* in the commit message; the diff already shows what.
- Protocol changes need a note on what breaks for existing agents.

## License

Contributions are licensed under Apache-2.0, the same as the rest of this repository. By opening a pull request you confirm you have the right to submit the work under that license.
