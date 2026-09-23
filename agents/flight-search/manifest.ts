import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest defining the Flight Search Agent's capabilities, pricing, and schemas. */
export const flightSearchManifest: PilaAgentManifest = {
  id: "flight-search-agent",
  name: "Flight Search Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Searches real-time flight data and returns the best options for any route and date",
  category: "Travel",
  capabilities: [
    "Search one-way flights",
    "Search round-trip flights",
    "Compare airlines",
    "Find cheapest dates",
    "Return structured flight options",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific flight search assignment",
  },
  outputSchema: {
    success: true,
    data: {
      flights: "array of flight options",
      cheapest_option: "object",
      fastest_option: "object",
      recommended_option: "object with reasoning",
    },
    summary: "string — human readable summary of best options",
    confidence: 1.0,
    sources: ["SerpAPI Google Flights"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.03,
    currency: "USD",
  },
  tags: ["flights", "travel", "airlines", "booking"],
};
