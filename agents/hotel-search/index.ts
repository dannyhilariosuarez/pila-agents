/** Hotel search agent — queries accommodation data via SerpAPI and Claude. */

import Anthropic from "@anthropic-ai/sdk";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { hotelSearchManifest } from "./manifest.js";

/** A single hotel option returned from search results. */
interface HotelOption {
  name: string;
  price: number;
  currency: string;
  rating: number;
  amenities: string[];
  location: string;
  bookingUrl: string;
}

/** Structured hotel search parameters extracted from the user's query. */
interface ParsedSearch {
  destination: string;
  check_in: string;
  check_out: string;
  guests: number;
  budget?: number;
}

const anthropic = new Anthropic();

/** Claude model used for search parsing and data extraction. */
const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;
/** Maximum number of hotel results to return. */
const MAX_HOTEL_RESULTS = 10;

/** Use Claude to extract destination, dates, and budget from a natural-language query. */
async function parseSearchWithClaude(
  task: string,
  subTask: string,
): Promise<ParsedSearch> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: `Extract hotel search parameters from the user's request. Return ONLY valid JSON:
{
  "destination": "city or region name",
  "check_in": "YYYY-MM-DD format, use 2026-04-01 if no date specified",
  "check_out": "YYYY-MM-DD format, use the day after check_in if no checkout date specified",
  "guests": number of guests (default 2),
  "budget": maximum nightly budget in USD if mentioned, omit if not specified
}`,
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
  return JSON.parse(cleaned.slice(start, end + 1)) as ParsedSearch;
}

/** Query SerpAPI Google Hotels for real-time hotel availability and pricing. */
async function searchSerpAPI(
  search: ParsedSearch,
  apiKey: string,
): Promise<{
  hotels: HotelOption[];
  source: string;
}> {
  const params = new URLSearchParams({
    engine: "google_hotels",
    q: search.destination,
    check_in_date: search.check_in,
    check_out_date: search.check_out,
    adults: String(search.guests),
    currency: "USD",
    hl: "en",
    api_key: apiKey,
  });

  if (search.budget) {
    params.set("max_price", String(search.budget));
  }

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`SerpAPI returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    properties?: Array<{
      name: string;
      rate_per_night?: { lowest?: string; extracted_lowest?: number };
      overall_rating?: number;
      amenities?: string[];
      neighborhood?: string;
      link?: string;
      gps_coordinates?: { latitude: number; longitude: number };
    }>;
  };

  const properties = data.properties ?? [];

  const hotels: HotelOption[] = properties
    .filter((p) => p.rate_per_night?.extracted_lowest)
    .slice(0, MAX_HOTEL_RESULTS)
    .map((p) => ({
      name: p.name,
      price: p.rate_per_night?.extracted_lowest ?? 0,
      currency: "USD",
      rating: Math.round((p.overall_rating ?? 0) * 10) / 10,
      amenities: p.amenities ?? [],
      location: p.neighborhood ?? search.destination,
      bookingUrl: p.link ?? "",
    }));

  return { hotels, source: url.replace(apiKey, "***") };
}

/** Fallback hotel search via Tavily when SerpAPI is unavailable. */
async function searchTavilyFallback(
  search: ParsedSearch,
  apiKey: string,
): Promise<{
  hotels: HotelOption[];
  source: string;
}> {
  const budgetClause = search.budget
    ? ` under $${search.budget} per night`
    : "";
  const query = `hotels in ${search.destination} ${search.check_in} to ${search.check_out} prices ratings${budgetClause}`;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily returned ${res.status}`);
  }

  const data = (await res.json()) as {
    results: Array<{ title: string; content: string; url: string }>;
  };

  // Use Claude to extract hotel data from search results
  const searchContent = data.results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `Extract hotel options from the search results. Return ONLY a JSON array:
[{"name":"...","price":123,"currency":"USD","rating":4.5,"amenities":["WiFi","Pool"],"location":"...","bookingUrl":"..."}]
If you cannot extract exact data, provide your best estimates based on the information.`,
    messages: [
      {
        role: "user",
        content: `Search results for hotels in ${search.destination} from ${search.check_in} to ${search.check_out}:\n\n${searchContent}`,
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
  const hotels = JSON.parse(cleaned.slice(start, end + 1)) as HotelOption[];

  return {
    hotels,
    source: `Tavily search: ${query}`,
  };
}

/** Searches for hotel accommodations using Claude to parse locations and generate options. */
export class HotelSearchAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = hotelSearchManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing hotel search parameters from task...");
    const search = await parseSearchWithClaude(input.task, input.subTask);
    this.log(
      `Search: ${search.destination}, ${search.check_in} to ${search.check_out}, ${search.guests} guests`,
    );

    let hotels: HotelOption[];
    let source: string;
    let confidence: number;

    // Try SerpAPI first, fall back to Tavily
    try {
      const serpApiKey = this.getApiKey("SERPAPI_KEY");
      const result = await searchSerpAPI(search, serpApiKey);
      hotels = result.hotels;
      source = result.source;
      confidence = 1.0;
      this.log(`SerpAPI returned ${hotels.length} hotels`);
    } catch (serpErr) {
      this.log(
        `SerpAPI failed: ${serpErr instanceof Error ? serpErr.message : String(serpErr)}, falling back to Tavily`,
      );
      try {
        const tavilyKey = this.getApiKey("TAVILY_API_KEY");
        const result = await searchTavilyFallback(search, tavilyKey);
        hotels = result.hotels;
        source = result.source;
        confidence = 0.6;
        this.log(`Tavily fallback returned ${hotels.length} hotels`);
      } catch (tavilyErr) {
        throw new Error(
          `Both SerpAPI and Tavily failed. SerpAPI: ${serpErr instanceof Error ? serpErr.message : String(serpErr)}. Tavily: ${tavilyErr instanceof Error ? tavilyErr.message : String(tavilyErr)}`,
        );
      }
    }

    if (hotels.length === 0) {
      return {
        success: false,
        data: { search },
        summary: `No hotels found in ${search.destination} for ${search.check_in} to ${search.check_out}.`,
        confidence: 0,
        sources: [source],
        executionTime: 0,
        error: "No hotel results returned",
      };
    }

    // Analyze results
    const cheapest = hotels.reduce((a, b) => (a.price < b.price ? a : b));
    const highestRated = hotels.reduce((a, b) => (a.rating > b.rating ? a : b));

    // Recommended: best value (balance of price and rating)
    const scored = hotels.map((h) => ({
      hotel: h,
      score:
        h.price * 0.4 + (5 - h.rating) * 80 + (h.amenities.length > 0 ? 0 : 50),
    }));
    scored.sort((a, b) => a.score - b.score);
    const firstHotel = hotels[0];
    if (!firstHotel) {
      throw new Error("Unexpected empty hotels array");
    }
    const recommended = scored[0]?.hotel ?? firstHotel;

    const summary = [
      `Found ${hotels.length} hotels in ${search.destination} for ${search.check_in} to ${search.check_out}.`,
      `Cheapest: ${cheapest.name} at $${cheapest.price}/night (${cheapest.rating} stars).`,
      `Highest rated: ${highestRated.name} at $${highestRated.price}/night (${highestRated.rating} stars).`,
      `Recommended: ${recommended.name} at $${recommended.price}/night — best balance of price, rating, and amenities.`,
    ].join(" ");

    return {
      success: true,
      data: {
        search,
        hotels,
        cheapest_option: cheapest,
        highest_rated: highestRated,
        recommended_option: {
          ...recommended,
          reasoning: "Best balance of price, rating, and amenities",
        },
        total_options: hotels.length,
      },
      summary,
      confidence,
      sources: [source],
      executionTime: 0,
    };
  }
}
