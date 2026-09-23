import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest defining the Market Data Agent's capabilities, pricing, and schemas. */
export const marketDataManifest: PilaAgentManifest = {
  id: "market-data-agent",
  name: "Market Data Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Fetches real-time financial market data including stock prices, cryptocurrency values, and market indices",
  category: "Finance",
  capabilities: [
    "Retrieve stock prices",
    "Track cryptocurrency values",
    "Analyze market indices",
    "Compare financial instruments",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific market data assignment",
  },
  outputSchema: {
    success: true,
    data: {
      instruments: "array of financial instrument data",
      primary_instrument: "object — main queried instrument",
      market_summary: "object — overall market context",
    },
    summary: "string — human readable summary of market data",
    confidence: 0.8,
    sources: ["Tavily web search"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.03,
    currency: "USD",
  },
  tags: ["stocks", "crypto", "finance", "market-data", "indices"],
};
