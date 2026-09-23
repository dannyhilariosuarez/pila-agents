import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest defining the Hotel Search Agent's capabilities, pricing, and schemas. */
export const hotelSearchManifest: PilaAgentManifest = {
  id: "hotel-search-agent",
  name: "Hotel Search Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Searches real-time hotel and accommodation data and returns the best options for any destination and dates",
  category: "Travel",
  capabilities: [
    "Search hotel availability",
    "Compare hotel prices",
    "Find accommodations by budget",
    "Retrieve hotel ratings and reviews",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific hotel search assignment",
  },
  outputSchema: {
    success: true,
    data: {
      hotels: "array of hotel options",
      cheapest_option: "object",
      highest_rated: "object",
      recommended_option: "object with reasoning",
    },
    summary: "string — human readable summary of best options",
    confidence: 1.0,
    sources: ["SerpAPI Google Hotels"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.04,
    currency: "USD",
  },
  tags: ["hotels", "travel", "accommodations", "booking"],
};
