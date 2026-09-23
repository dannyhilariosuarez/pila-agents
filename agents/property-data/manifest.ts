import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest defining the Property Data Agent's capabilities, pricing, and schemas. */
export const propertyDataManifest: PilaAgentManifest = {
  id: "property-data-agent",
  name: "Property Data Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Fetches real property data including valuations, comparable sales, and neighborhood statistics via web search",
  category: "RealEstate",
  capabilities: [
    "Retrieve property valuations",
    "Search comparable sales",
    "Analyze neighborhood data",
    "Look up property details",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific property data assignment",
  },
  outputSchema: {
    success: true,
    data: {
      address: "string — normalized property address",
      estimatedValue: "object with amount and currency",
      comparables: "array of comparable sales",
      neighborhoodStats: "object with area statistics",
      propertyDetails: "object with property attributes",
    },
    summary: "string — human readable summary of property data",
    confidence: 0.8,
    sources: ["Tavily web search"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.05,
    currency: "USD",
  },
  tags: ["property", "real-estate", "valuation", "housing"],
};
