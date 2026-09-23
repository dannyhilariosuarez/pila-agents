/** Property data agent — retrieves real estate listings and market data. */

import Anthropic from "@anthropic-ai/sdk";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { propertyDataManifest } from "./manifest.js";

/** Structured address components extracted from the user's query. */
interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
}

/** A comparable property sale used for valuation analysis. */
interface Comparable {
  address: string;
  salePrice: number;
  saleDate: string;
  squareFeet: number;
  bedrooms: number;
  bathrooms: number;
}

/** Aggregated neighborhood housing market statistics. */
interface NeighborhoodStats {
  medianHomeValue: number;
  medianRent: number;
  avgPricePerSqFt: number;
  yearOverYearAppreciation: string;
  walkScore: number | null;
}

/** Physical characteristics of a property. */
interface PropertyDetails {
  squareFeet: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  lotSize: string | null;
  propertyType: string;
}

/** Complete property valuation data assembled from multiple search queries. */
interface PropertyData {
  address: ParsedAddress;
  estimatedValue: { amount: number; currency: string };
  comparables: Comparable[];
  neighborhoodStats: NeighborhoodStats;
  propertyDetails: PropertyDetails;
}

/** A single result from the Tavily search API. */
interface TavilyResult {
  title: string;
  content: string;
  url: string;
}

/** Response shape from the Tavily search API. */
interface TavilyResponse {
  results: TavilyResult[];
}

const anthropic = new Anthropic();

/** Claude model used for address parsing and data extraction. */
const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;
/** Maximum number of Tavily search results per query. */
const MAX_SEARCH_RESULTS = 5;

/** Use Claude to extract a structured property address from a natural-language query. */
async function parseAddressWithClaude(
  task: string,
  subTask: string,
): Promise<ParsedAddress> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: `Extract a property address from the user's request. Return ONLY valid JSON:
{
  "street": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zip": "78701",
  "fullAddress": "123 Main St, Austin, TX 78701"
}
If the zip code is not provided, leave it as an empty string.
If the state is not provided, make your best guess from context.`,
    messages: [
      {
        role: "user",
        content: `Original task: ${task}\nSpecific assignment: ${subTask}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "{}";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1)) as ParsedAddress;
}

/** Query Tavily search API and return raw results. */
async function searchTavily(
  query: string,
  apiKey: string,
): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: MAX_SEARCH_RESULTS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results;
}

/** Search for and extract the estimated property value via Tavily + Claude. */
async function searchPropertyValue(
  address: ParsedAddress,
  apiKey: string,
): Promise<{
  estimatedValue: { amount: number; currency: string };
  source: string;
}> {
  const query = `${address.fullAddress} property value estimate home worth Zillow Redfin`;
  const results = await searchTavily(query, apiKey);

  const searchContent = results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: `Extract the estimated property value from search results. Return ONLY valid JSON:
{"amount": 450000, "currency": "USD"}
Provide your best estimate based on the available information. If no data is found, estimate based on the area.`,
    messages: [
      {
        role: "user",
        content: `Property: ${address.fullAddress}\n\nSearch results:\n${searchContent}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "{}";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const value = JSON.parse(cleaned.slice(start, end + 1)) as {
    amount: number;
    currency: string;
  };

  return {
    estimatedValue: value,
    source: `Tavily search: ${query}`,
  };
}

/** Search for comparable property sales near the target address. */
async function searchComparables(
  address: ParsedAddress,
  apiKey: string,
): Promise<{
  comparables: Comparable[];
  source: string;
}> {
  const query = `${address.city} ${address.state} recent home sales comparable properties near ${address.street}`;
  const results = await searchTavily(query, apiKey);

  const searchContent = results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `Extract comparable property sales from the search results. Return ONLY a JSON array:
[{"address":"123 Oak St, City, ST","salePrice":400000,"saleDate":"2025-01","squareFeet":1800,"bedrooms":3,"bathrooms":2}]
Include up to 5 comparables. Estimate values when exact data is unavailable.`,
    messages: [
      {
        role: "user",
        content: `Find comparable sales near: ${address.fullAddress}\n\nSearch results:\n${searchContent}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "[]";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  const comparables = JSON.parse(cleaned.slice(start, end + 1)) as Comparable[];

  return {
    comparables,
    source: `Tavily search: ${query}`,
  };
}

/** Search for neighborhood housing market statistics. */
async function searchNeighborhoodData(
  address: ParsedAddress,
  apiKey: string,
): Promise<{
  neighborhoodStats: NeighborhoodStats;
  source: string;
}> {
  const query = `${address.city} ${address.state} ${address.zip} neighborhood housing market statistics median home price`;
  const results = await searchTavily(query, apiKey);

  const searchContent = results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `Extract neighborhood statistics from the search results. Return ONLY valid JSON:
{"medianHomeValue":350000,"medianRent":1800,"avgPricePerSqFt":200,"yearOverYearAppreciation":"5.2%","walkScore":72}
Set walkScore to null if not found. Estimate values when exact data is unavailable.`,
    messages: [
      {
        role: "user",
        content: `Neighborhood data for: ${address.fullAddress}\n\nSearch results:\n${searchContent}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "{}";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const stats = JSON.parse(cleaned.slice(start, end + 1)) as NeighborhoodStats;

  return {
    neighborhoodStats: stats,
    source: `Tavily search: ${query}`,
  };
}

/** Search for and extract physical property details (beds, baths, sq ft). */
async function searchPropertyDetails(
  address: ParsedAddress,
  apiKey: string,
): Promise<{
  propertyDetails: PropertyDetails;
  source: string;
}> {
  const query = `${address.fullAddress} property details bedrooms bathrooms square feet year built`;
  const results = await searchTavily(query, apiKey);

  const searchContent = results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `Extract property details from the search results. Return ONLY valid JSON:
{"squareFeet":2000,"bedrooms":3,"bathrooms":2,"yearBuilt":1995,"lotSize":"0.25 acres","propertyType":"Single Family"}
Set fields to null if data is not available. propertyType should always have a value (estimate if needed).`,
    messages: [
      {
        role: "user",
        content: `Property details for: ${address.fullAddress}\n\nSearch results:\n${searchContent}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "{}";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const details = JSON.parse(cleaned.slice(start, end + 1)) as PropertyDetails;

  return {
    propertyDetails: details,
    source: `Tavily search: ${query}`,
  };
}

/** Retrieves property market data and valuations for real estate queries. */
export class PropertyDataAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = propertyDataManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing property address from task...");
    const address = await parseAddressWithClaude(input.task, input.subTask);
    this.log(`Address: ${address.fullAddress}`);

    const tavilyKey = this.getApiKey("TAVILY_API_KEY");
    const sources: string[] = [];

    // Run all searches in parallel for performance
    let valueResult: Awaited<ReturnType<typeof searchPropertyValue>>;
    let compResult: Awaited<ReturnType<typeof searchComparables>>;
    let neighborhoodResult: Awaited<ReturnType<typeof searchNeighborhoodData>>;
    let detailsResult: Awaited<ReturnType<typeof searchPropertyDetails>>;

    try {
      this.log("Searching for property data via Tavily...");
      [valueResult, compResult, neighborhoodResult, detailsResult] =
        await Promise.all([
          searchPropertyValue(address, tavilyKey),
          searchComparables(address, tavilyKey),
          searchNeighborhoodData(address, tavilyKey),
          searchPropertyDetails(address, tavilyKey),
        ]);

      sources.push(
        valueResult.source,
        compResult.source,
        neighborhoodResult.source,
        detailsResult.source,
      );
      this.log(
        `Found: value estimate, ${compResult.comparables.length} comparables, neighborhood stats, property details`,
      );
    } catch (err) {
      throw new Error(
        `Tavily search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const propertyData: PropertyData = {
      address,
      estimatedValue: valueResult.estimatedValue,
      comparables: compResult.comparables,
      neighborhoodStats: neighborhoodResult.neighborhoodStats,
      propertyDetails: detailsResult.propertyDetails,
    };

    if (propertyData.estimatedValue.amount === 0) {
      return {
        success: false,
        data: { address },
        summary: `Could not determine property value for ${address.fullAddress}.`,
        confidence: 0,
        sources,
        executionTime: 0,
        error: "Unable to estimate property value from search results",
      };
    }

    const formattedValue = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: propertyData.estimatedValue.currency,
      maximumFractionDigits: 0,
    }).format(propertyData.estimatedValue.amount);

    const formattedMedian = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(propertyData.neighborhoodStats.medianHomeValue);

    const summary = [
      `Property at ${address.fullAddress} has an estimated value of ${formattedValue}.`,
      `Found ${propertyData.comparables.length} comparable sales in the area.`,
      `Neighborhood median home value: ${formattedMedian}, appreciation: ${propertyData.neighborhoodStats.yearOverYearAppreciation} YoY.`,
      propertyData.propertyDetails.squareFeet
        ? `Property: ${propertyData.propertyDetails.squareFeet} sq ft, ${propertyData.propertyDetails.bedrooms}bd/${propertyData.propertyDetails.bathrooms}ba, built ${propertyData.propertyDetails.yearBuilt}.`
        : `Property type: ${propertyData.propertyDetails.propertyType}.`,
    ].join(" ");

    return {
      success: true,
      data: propertyData as unknown as Record<string, unknown>,
      summary,
      confidence: 0.8,
      sources,
      executionTime: 0,
    };
  }
}
