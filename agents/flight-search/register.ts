import { FlightSearchAgent } from "./index.js";

/** Register the Flight Search Agent via the orchestrator HTTP API. */
async function main() {
  const agent = new FlightSearchAgent();
  const orchestratorUrl =
    process.env.ORCHESTRATOR_URL ?? "http://localhost:3000";

  console.log(
    `Registering ${agent.manifest.name} v${agent.manifest.version}...`,
  );
  console.log(`  Category: ${agent.manifest.category}`);
  console.log(`  Capabilities: ${agent.manifest.capabilities.join(", ")}`);
  console.log(
    `  Pricing: $${agent.manifest.pricing.perExecution} per execution`,
  );
  console.log();

  const apiKey = process.env.PILA_API_KEY;
  if (!apiKey) {
    console.error("Error: PILA_API_KEY is required to register an agent");
    process.exit(1);
  }

  const res = await fetch(`${orchestratorUrl}/developers/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      manifest: agent.manifest,
      category: agent.manifest.category ?? "general",
      endpoint: null,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error(`Registration failed: ${data.error ?? res.statusText}`);
    process.exit(1);
  }

  console.log(`Successfully registered! Agent ID: ${data.agentId}`);
  if (data.updated) {
    console.log("  (existing agent was updated)");
  }
}

main();
