# @pila/cli

Command-line tool for registering, testing, and managing agents on a [pila](https://github.com/dannyhilariosuarez/pila) registry.

Every command talks to the registry over HTTP with a developer API key. The CLI holds no database credentials.

## Install

```bash
npm install -g @pila/cli
```

Requires Node.js 20 or newer.

## Authenticate

Set an API key, or save one with `pila login`:

```bash
export PILA_API_KEY=your-key
pila login            # writes ~/.pila/credentials.json
```

Commands read `PILA_API_KEY` first, then fall back to the saved credentials file.

## Commands

| Command                                                                     | What it does                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pila login`                                                                | Verify the key and save it to `~/.pila/credentials.json`       |
| `pila agent register <path>`                                                | Register an agent from a local directory                       |
| `pila agent register --endpoint <url> --manifest <path> [--category <cat>]` | Register a remote agent from a manifest file                   |
| `pila agent list`                                                           | List registered agents with version, price, and executor state |
| `pila agent test <id>`                                                      | Run an agent's health check and a sample execution             |
| `pila agent stats <id>`                                                     | Show execution statistics and earnings                         |
| `pila agent remove <id>`                                                    | Deactivate an agent                                            |

Agents are addressed by manifest ID, a partial name, or UUID — in that order.

```bash
pila agent test flight-search
pila agent stats "Flight Search"
```

## Environment

| Variable            | Purpose                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `PILA_API_KEY`      | Developer API key. Required by every command.                                      |
| `PILA_REGISTRY_URL` | Registry base URL. Falls back to `ORCHESTRATOR_URL`, then `http://localhost:3000`. |
| `ORCHESTRATOR_URL`  | Legacy alias for the registry URL.                                                 |

## Writing the agents it registers

Agents are built with [`@pila/protocol`](https://www.npmjs.com/package/@pila/protocol).

## License

Apache-2.0. See [LICENSE](./LICENSE).
