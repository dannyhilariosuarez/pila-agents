#!/usr/bin/env node
/**
 * @module cli - Pila Agent Registry CLI for registering, testing, and managing agents.
 */
import "dotenv/config";
import { registerAgent } from "@pila/protocol";
import type { PilaAgent, PilaAgentManifest } from "@pila/protocol";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

/** Exit the process after a short delay to flush stdout. */
function exit(code: number): void {
  setTimeout(() => process.exit(code), 100);
}

/** Base URL of the orchestrator this CLI talks to. */
function registryUrl(): string {
  return (
    process.env.PILA_REGISTRY_URL ??
    process.env.ORCHESTRATOR_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/** Read the developer API key from the environment or ~/.pila/credentials.json. */
function getApiKey(): string | undefined {
  if (process.env.PILA_API_KEY) return process.env.PILA_API_KEY;
  try {
    const raw = readFileSync(
      join(homedir(), ".pila", "credentials.json"),
      "utf-8",
    );
    const creds = JSON.parse(raw) as { apiKey?: string };
    return creds.apiKey;
  } catch {
    return undefined;
  }
}

/**
 * Call a developer endpoint on the orchestrator with the API key attached.
 *
 * Distinguishes "the registry says no such agent" from "the call failed", so
 * callers do not report a missing agent when the registry was unreachable.
 * Failures print their own reason before returning.
 */
type RegistryResult<T> =
  | { ok: true; data: T }
  | { ok: false; notFound: boolean };

async function registryFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<RegistryResult<T>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      "Error: no API key. Set PILA_API_KEY or run `pila login` first.",
    );
    return { ok: false, notFound: false };
  }

  const url = `${registryUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    console.error(
      `Failed to reach the registry at ${registryUrl()}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, notFound: false };
  }

  if (res.status === 404) return { ok: false, notFound: true };

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    console.error(
      `Request failed (${res.status}): ${body.error ?? res.statusText}`,
    );
    return { ok: false, notFound: false };
  }

  return { ok: true, data: (await res.json()) as T };
}

/** Extract the value of a named CLI flag (e.g. --endpoint <url>). */
function parseFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

/** Print CLI usage instructions to stdout. */
function usage() {
  console.log(`
pila — Pila Agent Registry CLI

Usage:
  pila login                 Authenticate with the Pila platform
  pila agent register <path> Register an agent from a local directory
  pila agent register --endpoint <url> --manifest <path> [--category <cat>]
                             Register a remote agent via manifest JSON
  pila agent list            List all registered agents
  pila agent test <id>       Test an agent's health and execution
  pila agent stats <id>      Show agent performance statistics
  pila agent remove <id>     Remove an agent from the registry

Environment:
  ORCHESTRATOR_URL           Orchestrator URL (default: http://localhost:3000)
  PILA_API_KEY               API key for authentication
  PILA_REGISTRY_URL          Registry URL (falls back to ORCHESTRATOR_URL)
`);
}

/** Register a local agent by importing its module and calling registerAgent. */
async function agentRegister(agentPath: string) {
  const base = isAbsolute(agentPath)
    ? agentPath
    : resolve(process.cwd(), agentPath);
  // Try .ts first (source), then .js (compiled)
  let mod: Record<string, unknown> | null = null;
  for (const ext of ["index.ts", "index.js"]) {
    try {
      const resolved = new URL(`file://${base}/${ext}`);
      mod = (await import(resolved.href)) as Record<string, unknown>;
      break;
    } catch {
      // try next extension
    }
  }

  if (!mod) {
    console.error(`Could not import agent from ${agentPath}`);
    console.error(`Try: cd ${agentPath} && pnpm register`);
    exit(1);
    return;
  }

  let agent: PilaAgent | null = null;
  for (const value of Object.values(mod)) {
    if (typeof value === "function") {
      try {
        const instance = new (value as new () => PilaAgent)();
        if (instance.manifest && typeof instance.execute === "function") {
          agent = instance;
          break;
        }
      } catch {
        // not a constructable agent class
      }
    }
  }

  if (!agent) {
    console.error("Error: No PilaAgent class found in module exports");
    exit(1);
    return;
  }

  console.log(
    `Registering ${agent.manifest.name} v${agent.manifest.version}...`,
  );

  const result = await registerAgent(agent, { source: "cli" });

  if (!result.success) {
    for (const error of result.errors ?? []) console.error(error);
    exit(1);
    return;
  }

  console.log(`Registered! Agent ID: ${result.agentId}`);
  exit(0);
}

/** Register a remote agent via HTTP endpoint and manifest JSON file. */
async function agentRegisterRemote(
  endpoint: string,
  manifestPath: string,
  category: string,
) {
  let manifest: Record<string, unknown>;
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error(
      `Failed to read manifest from ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    exit(1);
    return;
  }

  const orchestratorUrl =
    process.env.ORCHESTRATOR_URL ?? "http://localhost:3000";

  const apiKey = process.env.PILA_API_KEY;
  if (!apiKey) {
    console.error("Error: PILA_API_KEY is required to register an agent");
    exit(1);
    return;
  }

  try {
    const res = await fetch(`${orchestratorUrl}/developers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ manifest, endpoint, category }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      console.error(`Registration failed: ${data.error ?? res.statusText}`);
      exit(1);
      return;
    }

    console.log(`Registered remote agent! ID: ${data.agentId}`);
    console.log(`  Name:     ${data.name}`);
    console.log(`  Endpoint: ${endpoint}`);
  } catch (err) {
    console.error(
      `Failed to reach orchestrator: ${err instanceof Error ? err.message : String(err)}`,
    );
    exit(1);
    return;
  }
  exit(0);
}

/** List all registered agents via the orchestrator's developer registry. */
async function agentList() {
  const result = await registryFetch<{
    agents: Array<{
      id: string;
      manifestId: string | null;
      name: string;
      category: string;
      version: string | null;
      pricePerTask: number;
      isActive: boolean;
      source: string;
      hasRealExecutor: boolean;
      registeredAt: string | null;
    }>;
    total: number;
  }>("/developers/registry");

  if (!result.ok) {
    exit(1);
    return;
  }

  const data = result.data;

  if (data.agents.length === 0) {
    console.log("No agents registered.");
    exit(0);
    return;
  }

  console.log(
    `\n${"Name".padEnd(24)} ${"Category".padEnd(13)} ${"Version".padEnd(9)} ${"Price".padEnd(7)} ${"Source".padEnd(11)} ${"Executor".padEnd(9)} ${"Registered"}`,
  );
  console.log("\u2500".repeat(96));

  for (const a of data.agents) {
    const version = a.version ?? "\u2014";
    const price = `$${Number(a.pricePerTask).toFixed(2)}`;
    const executor = a.hasRealExecutor ? "REAL" : "claude";
    const registered = a.registeredAt
      ? new Date(a.registeredAt).toLocaleDateString()
      : "\u2014";
    const name = a.isActive ? a.name : `${a.name} (inactive)`;
    console.log(
      `${name.padEnd(24)} ${a.category.padEnd(13)} ${version.padEnd(9)} ${price.padEnd(7)} ${a.source.padEnd(11)} ${executor.padEnd(9)} ${registered}`,
    );
  }

  console.log(`\nTotal: ${data.total} agents`);
  exit(0);
}

/** Find an agent by manifest ID, name (fuzzy), or UUID via the registry API. */
async function findAgentBySlug(
  slug: string,
): Promise<Record<string, unknown> | null> {
  const result = await registryFetch<Record<string, unknown>>(
    `/developers/registry/${encodeURIComponent(slug)}`,
  );
  return result.ok ? result.data : null;
}

/** Test an agent's health check and execute a sample task. */
async function agentTest(nameOrId: string) {
  const agent = await findAgentBySlug(nameOrId);

  if (!agent) {
    console.error(`Agent "${nameOrId}" not found`);
    exit(1);
    return;
  }

  const manifest = agent.manifest as PilaAgentManifest | null;

  // Print full manifest
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  AGENT: ${agent.name}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Slug:          ${manifest?.id ?? "—"}`);
  console.log(`  Version:       ${manifest?.version ?? "—"}`);
  console.log(`  Author:        ${manifest?.author ?? "—"}`);
  console.log(`  Category:      ${agent.category}`);
  console.log(`  Description:   ${agent.description}`);
  console.log(
    `  Price:         $${Number(agent.price_per_task).toFixed(2)} per execution`,
  );
  console.log(`  Active:        ${agent.is_active ? "yes" : "no"}`);

  if (manifest?.capabilities) {
    console.log(`  Capabilities:`);
    for (const cap of manifest.capabilities) {
      console.log(`    - ${cap}`);
    }
  }

  if (manifest?.tags) {
    console.log(`  Tags:          ${manifest.tags.join(", ")}`);
  }

  // Try to load the real agent executor
  if (manifest?.id) {
    const dirName = manifest.id.replace(/-agent$/, "");
    const importPath = `../../../agents/${dirName}/index.js`;

    try {
      const mod = (await import(importPath)) as Record<string, unknown>;
      let realAgent: PilaAgent | null = null;

      for (const value of Object.values(mod)) {
        if (typeof value === "function") {
          try {
            const instance = new (value as new () => PilaAgent)();
            if (instance.manifest && typeof instance.execute === "function") {
              realAgent = instance;
              break;
            }
          } catch {
            // not constructable
          }
        }
      }

      if (realAgent) {
        // Health check
        console.log(`\n  Health Check...`);
        const healthy = await realAgent.healthCheck();
        console.log(`  Result: ${healthy ? "PASS ✓" : "FAIL ✗"}`);

        // Test execution
        console.log(`\n  Test Execution...`);
        console.log(`  Task:    "Plan a 5 day trip to Tokyo"`);
        console.log(
          `  SubTask: "Search for flights from New York to Tokyo in August"`,
        );
        console.log(`  Running...\n`);

        const result = await realAgent.execute({
          task: "Plan a 5 day trip to Tokyo",
          subTask: "Search for flights from New York to Tokyo in August",
        });

        console.log(`  Success:        ${result.success}`);
        console.log(`  Confidence:     ${result.confidence}`);
        console.log(`  Execution Time: ${result.executionTime}ms`);
        if (result.sources && result.sources.length > 0) {
          console.log(`  Sources:        ${result.sources.join(", ")}`);
        }
        if (result.error) {
          console.log(`  Error:          ${result.error}`);
        }
        console.log(`\n  Summary:`);
        console.log(`  ${result.summary}`);

        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>;
          const flights = data.flights as
            | Array<Record<string, unknown>>
            | undefined;
          if (flights && flights.length > 0) {
            console.log(`\n  Flights Found: ${flights.length}`);
            console.log(
              `  ${"Airline".padEnd(20)} ${"Price".padEnd(10)} ${"Duration".padEnd(12)} ${"Stops"}`,
            );
            console.log(`  ${"─".repeat(50)}`);
            for (const f of flights.slice(0, 5)) {
              console.log(
                `  ${String(f.airline ?? "").padEnd(20)} $${String(f.price ?? "").padEnd(9)} ${String(f.duration ?? "").padEnd(12)} ${f.stops ?? 0}`,
              );
            }
            if (flights.length > 5) {
              console.log(`  ... and ${flights.length - 5} more`);
            }
          }

          const cheapest = data.cheapest_option as
            | Record<string, unknown>
            | undefined;
          if (cheapest) {
            console.log(
              `\n  Cheapest: ${cheapest.airline} — $${cheapest.price} (${cheapest.duration})`,
            );
          }
          const fastest = data.fastest_option as
            | Record<string, unknown>
            | undefined;
          if (fastest) {
            console.log(
              `  Fastest:  ${fastest.airline} — $${fastest.price} (${fastest.duration})`,
            );
          }
          const recommended = data.recommended_option as
            | Record<string, unknown>
            | undefined;
          if (recommended) {
            console.log(
              `  Best:     ${recommended.airline} — $${recommended.price} (${recommended.duration})`,
            );
          }
        }
      } else {
        console.log("\n  Could not instantiate agent executor.");
      }
    } catch (err) {
      console.log(
        `\n  Could not load agent executor: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.log("  Agent is registered but no local executor found.");
    }
  } else {
    console.log(
      "\n  Status: Registered (generic Claude execution, no manifest slug)",
    );
  }

  exit(0);
}

/** Deactivate an agent by setting is_active to false. */
async function agentRemove(nameOrId: string) {
  const result = await registryFetch<{
    success: boolean;
    agentId: string;
    name: string;
  }>(`/developers/registry/${encodeURIComponent(nameOrId)}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    if (result.notFound) console.error(`Agent "${nameOrId}" not found`);
    exit(1);
    return;
  }

  console.log(
    `Deactivated agent "${result.data.name}" (${result.data.agentId})`,
  );
  exit(0);
}

/** Authenticate with the Pila platform and save credentials to ~/.pila/. */
async function login() {
  const apiKey = process.env.PILA_API_KEY;

  if (!apiKey) {
    console.error("Set PILA_API_KEY environment variable or pass --key <key>");
    exit(1);
    return;
  }

  const orchestratorUrl =
    process.env.ORCHESTRATOR_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${orchestratorUrl}/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.error("Authentication failed — could not reach orchestrator");
      exit(1);
      return;
    }

    const pilaDir = join(homedir(), ".pila");
    mkdirSync(pilaDir, { recursive: true });
    writeFileSync(
      join(pilaDir, "credentials.json"),
      JSON.stringify(
        { apiKey, orchestratorUrl, authenticatedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    console.log("Logged in successfully");
    console.log(`Credentials saved to ${join(pilaDir, "credentials.json")}`);
  } catch (err) {
    console.error(
      `Login failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    exit(1);
  }
  exit(0);
}

/** Display execution statistics and earnings for an agent. */
async function agentStats(nameOrId: string) {
  const agent = await findAgentBySlug(nameOrId);

  if (!agent) {
    console.error(`Agent "${nameOrId}" not found`);
    exit(1);
    return;
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  STATS: ${agent.name}`);
  console.log(`${"═".repeat(50)}`);
  console.log(`  Total Executions:      ${agent.total_executions ?? 0}`);
  console.log(`  Successful Executions: ${agent.successful_executions ?? 0}`);

  const totalExec = Number(agent.total_executions) || 0;
  const successExec = Number(agent.successful_executions) || 0;
  const successRate =
    totalExec > 0 ? ((successExec / totalExec) * 100).toFixed(1) : "N/A";
  console.log(`  Success Rate:          ${successRate}%`);
  console.log(`  Confidence Score:      ${agent.confidence_score ?? "N/A"}`);
  console.log(`  User Feedback Score:   ${agent.user_feedback_score ?? "N/A"}`);

  const earnings = agent.earnings as
    | { totalCents: number; paidExecutions: number }
    | undefined;
  if (earnings && earnings.paidExecutions > 0) {
    console.log(
      `  Total Earnings:        $${(earnings.totalCents / 100).toFixed(2)}`,
    );
    console.log(`  Paid Executions:       ${earnings.paidExecutions}`);
  }

  console.log(`${"═".repeat(50)}\n`);
  exit(0);
}

/** CLI entry point — parse command and subcommand, dispatch to handler. */
async function main() {
  if (command === "login") {
    await login();
    return;
  }

  if (command === "agent") {
    switch (subcommand) {
      case "register": {
        const endpoint = parseFlag("--endpoint");
        if (endpoint) {
          const manifestPath = parseFlag("--manifest");
          if (!manifestPath) {
            console.error(
              "Usage: pila agent register --endpoint <url> --manifest <path> [--category <cat>]",
            );
            exit(1);
            return;
          }
          const category = parseFlag("--category") ?? "general";
          await agentRegisterRemote(endpoint, manifestPath, category);
        } else {
          if (!args[2]) {
            console.error("Usage: pila agent register <path>");
            exit(1);
            return;
          }
          await agentRegister(args[2]);
        }
        break;
      }
      case "list":
        await agentList();
        break;
      case "test":
        if (!args[2]) {
          console.error("Usage: pila agent test <id-or-name>");
          exit(1);
          return;
        }
        await agentTest(args[2]);
        break;
      case "stats":
        if (!args[2]) {
          console.error("Usage: pila agent stats <id-or-name>");
          exit(1);
          return;
        }
        await agentStats(args[2]);
        break;
      case "remove":
        if (!args[2]) {
          console.error("Usage: pila agent remove <id-or-name>");
          exit(1);
          return;
        }
        await agentRemove(args[2]);
        break;
      default:
        usage();
        exit(0);
    }
  } else {
    usage();
    exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
