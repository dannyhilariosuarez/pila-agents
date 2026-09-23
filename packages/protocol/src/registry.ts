/**
 * @module registry - Agent registration with manifest validation and health checks.
 *
 * Registration goes through the pila registry's HTTP API using a developer API
 * key. Agent authors never hold database credentials.
 */
import type { PilaAgent, PilaCategory } from "./types.js";

const VALID_CATEGORIES: PilaCategory[] = [
  "Research",
  "Finance",
  "Legal",
  "Media",
  "Marketing",
  "Operations",
  "Technical",
  "Communications",
  "Travel",
  "RealEstate",
];

const DEFAULT_REGISTRY_URL = "http://localhost:3000";

/** Options for {@link registerAgent}. */
export interface RegisterAgentOptions {
  /** Registry base URL. Defaults to $PILA_REGISTRY_URL, then $ORCHESTRATOR_URL. */
  registryUrl?: string;
  /** Developer API key. Defaults to $PILA_API_KEY. */
  apiKey?: string;
  /** Where the registration came from (e.g. "cli"). */
  source?: string;
  /** Identifier of the developer performing the registration. */
  registeredBy?: string;
  logger?: { info: (msg: string) => void };
}

/** Validate an agent manifest, returning an array of error messages (empty = valid). */
function validateManifest(agent: PilaAgent): string[] {
  const m = agent.manifest;
  const errors: string[] = [];

  if (!m.id || !/^[a-z0-9-]+$/.test(m.id)) {
    errors.push("id must be a lowercase slug (a-z, 0-9, hyphens)");
  }
  if (!m.name) errors.push("name is required");
  if (!m.version || !/^\d+\.\d+\.\d+$/.test(m.version)) {
    errors.push("version must be valid semver (e.g. 1.0.0)");
  }
  if (!m.author) errors.push("author is required");
  if (!m.description) errors.push("description is required");
  if (!VALID_CATEGORIES.includes(m.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!m.capabilities.length) errors.push("capabilities must not be empty");
  if (!m.tags.length) errors.push("tags must not be empty");
  if (m.pricing.perExecution < 0) {
    errors.push("pricing.perExecution must be >= 0");
  }
  if (!m.pricing.currency) errors.push("pricing.currency is required");

  return errors;
}

/**
 * Register or update an agent in the pila registry after validation and a
 * health check.
 *
 * Requires a developer API key, passed as `options.apiKey` or in the
 * `PILA_API_KEY` environment variable.
 */
export async function registerAgent(
  agent: PilaAgent,
  options?: RegisterAgentOptions,
): Promise<{ success: boolean; agentId?: string; errors?: string[] }> {
  const errors = validateManifest(agent);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const healthy = await agent.healthCheck();
  if (!healthy) {
    return { success: false, errors: ["Agent health check failed"] };
  }

  const registryUrl = (
    options?.registryUrl ??
    process.env.PILA_REGISTRY_URL ??
    process.env.ORCHESTRATOR_URL ??
    DEFAULT_REGISTRY_URL
  ).replace(/\/+$/, "");

  const apiKey = options?.apiKey ?? process.env.PILA_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      errors: [
        "An API key is required: pass options.apiKey or set PILA_API_KEY",
      ],
    };
  }

  const m = agent.manifest;
  const url = `${registryUrl}/developers/register`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        manifest: m,
        category: m.category,
        endpoint: null,
        ...(options?.source ? { source: options.source } : {}),
        ...(options?.registeredBy
          ? { registeredBy: options.registeredBy }
          : {}),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errors: [`Could not reach the registry at ${registryUrl}: ${message}`],
    };
  }

  let payload: { agentId?: string; updated?: boolean; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Non-JSON body — fall through to the status-based error below.
  }

  if (!response.ok) {
    return {
      success: false,
      errors: [
        `Registration failed (${response.status}): ${payload.error ?? response.statusText}`,
      ],
    };
  }

  const verb = payload.updated ? "Updated" : "Registered";
  (options?.logger ?? console).info(
    `${verb} agent "${m.name}" (${payload.agentId})`,
  );

  return { success: true, agentId: payload.agentId };
}
