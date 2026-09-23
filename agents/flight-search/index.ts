/** Flight search agent — queries live flight data via SerpAPI and Claude. */

import Anthropic from "@anthropic-ai/sdk";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { flightSearchManifest } from "./manifest.js";

/** A single flight option returned from search results. */
interface FlightOption {
  airline: string;
  price: number;
  currency: string;
  duration: string;
  stops: number;
  departure_time: string;
  arrival_time: string;
}

/** Structured route extracted from the user's natural-language query. */
interface ParsedRoute {
  origin: string;
  destination: string;
  date: string;
  return_date?: string;
}

const anthropic = new Anthropic();

/** Claude model used for route parsing and data extraction. */
const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;
/** Maximum number of flight results to return. */
const MAX_FLIGHT_RESULTS = 10;
/** Fallback duration in minutes when the format cannot be parsed. */
const UNPARSEABLE_DURATION_MINUTES = 999;

/** Use Claude to extract origin, destination, and dates from a natural-language query. */
async function parseRouteWithClaude(
  task: string,
  subTask: string,
): Promise<ParsedRoute> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: `Extract flight search parameters from the user's request. Return ONLY valid JSON:
{
  "origin": "3-letter IATA airport code for origin city",
  "destination": "3-letter IATA airport code for destination city",
  "date": "YYYY-MM-DD format, use 2026-04-01 if no date specified",
  "return_date": "YYYY-MM-DD format if round trip, omit if one-way"
}
If the origin city is not specified, default to "JFK".`,
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
  return JSON.parse(cleaned.slice(start, end + 1)) as ParsedRoute;
}

/** Query SerpAPI Google Flights for real-time flight options. */
async function searchSerpAPI(
  route: ParsedRoute,
  apiKey: string,
): Promise<{
  flights: FlightOption[];
  source: string;
}> {
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: route.origin,
    arrival_id: route.destination,
    outbound_date: route.date,
    currency: "USD",
    hl: "en",
    api_key: apiKey,
  });

  if (route.return_date) {
    params.set("return_date", route.return_date);
  } else {
    params.set("type", "2"); // one-way
  }

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`SerpAPI returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    best_flights?: Array<{
      flights: Array<{
        airline: string;
        departure_airport: { time: string };
        arrival_airport: { time: string };
      }>;
      price: number;
      total_duration: number;
      layovers?: Array<Record<string, unknown>>;
    }>;
    other_flights?: Array<{
      flights: Array<{
        airline: string;
        departure_airport: { time: string };
        arrival_airport: { time: string };
      }>;
      price: number;
      total_duration: number;
      layovers?: Array<Record<string, unknown>>;
    }>;
  };

  const allFlights = [
    ...(data.best_flights ?? []),
    ...(data.other_flights ?? []),
  ];

  const flights: FlightOption[] = allFlights
    .slice(0, MAX_FLIGHT_RESULTS)
    .map((f) => {
      const firstLeg = f.flights[0];
      const lastLeg = f.flights[f.flights.length - 1];
      if (!firstLeg || !lastLeg) {
        return {
          airline: "Unknown",
          price: f.price,
          currency: "USD",
          duration: `${Math.floor(f.total_duration / 60)}h ${f.total_duration % 60}m`,
          stops: f.flights.length - 1,
          departure_time: "",
          arrival_time: "",
        };
      }
      const hours = Math.floor(f.total_duration / 60);
      const mins = f.total_duration % 60;
      return {
        airline: firstLeg.airline,
        price: f.price,
        currency: "USD",
        duration: `${hours}h ${mins}m`,
        stops: f.flights.length - 1,
        departure_time: firstLeg.departure_airport.time,
        arrival_time: lastLeg.arrival_airport.time,
      };
    });

  return { flights, source: url.replace(apiKey, "***") };
}

/** Fallback flight search via Tavily when SerpAPI is unavailable. */
async function searchTavilyFallback(
  route: ParsedRoute,
  apiKey: string,
): Promise<{
  flights: FlightOption[];
  source: string;
}> {
  const query = `flights from ${route.origin} to ${route.destination} on ${route.date} prices airlines`;
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

  // Use Claude to extract flight data from search results
  const searchContent = data.results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `Extract flight options from the search results. Return ONLY a JSON array:
[{"airline":"...","price":123,"currency":"USD","duration":"Xh Ym","stops":0,"departure_time":"HH:MM","arrival_time":"HH:MM"}]
If you cannot extract exact data, provide your best estimates based on the information.`,
    messages: [
      {
        role: "user",
        content: `Search results for flights ${route.origin} → ${route.destination} on ${route.date}:\n\n${searchContent}`,
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
  const flights = JSON.parse(cleaned.slice(start, end + 1)) as FlightOption[];

  return {
    flights,
    source: `Tavily search: ${query}`,
  };
}

/** Searches for flights using Claude to parse routes and generate realistic pricing. */
export class FlightSearchAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = flightSearchManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing route from task...");
    const route = await parseRouteWithClaude(input.task, input.subTask);
    this.log(`Route: ${route.origin} → ${route.destination} on ${route.date}`);

    let flights: FlightOption[];
    let source: string;
    let confidence: number;

    // Try SerpAPI first, fall back to Tavily
    try {
      const serpApiKey = this.getApiKey("SERPAPI_KEY");
      const result = await searchSerpAPI(route, serpApiKey);
      flights = result.flights;
      source = result.source;
      confidence = 1.0;
      this.log(`SerpAPI returned ${flights.length} flights`);
    } catch (serpErr) {
      this.log(
        `SerpAPI failed: ${serpErr instanceof Error ? serpErr.message : String(serpErr)}, falling back to Tavily`,
      );
      try {
        const tavilyKey = this.getApiKey("TAVILY_API_KEY");
        const result = await searchTavilyFallback(route, tavilyKey);
        flights = result.flights;
        source = result.source;
        confidence = 0.5;
        this.log(`Tavily fallback returned ${flights.length} flights`);
      } catch (tavilyErr) {
        throw new Error(
          `Both SerpAPI and Tavily failed. SerpAPI: ${serpErr instanceof Error ? serpErr.message : String(serpErr)}. Tavily: ${tavilyErr instanceof Error ? tavilyErr.message : String(tavilyErr)}`,
        );
      }
    }

    if (flights.length === 0) {
      return {
        success: false,
        data: { route },
        summary: `No flights found from ${route.origin} to ${route.destination} on ${route.date}.`,
        confidence: 0,
        sources: [source],
        executionTime: 0,
        error: "No flight results returned",
      };
    }

    // Analyze results
    const cheapest = flights.reduce((a, b) => (a.price < b.price ? a : b));
    const fastest = flights.reduce((a, b) => {
      const aDur = parseDurationMinutes(a.duration);
      const bDur = parseDurationMinutes(b.duration);
      return aDur < bDur ? a : b;
    });

    // Recommended: best value (low price + few stops + reasonable duration)
    const scored = flights.map((f) => ({
      flight: f,
      score:
        f.price * 0.5 + f.stops * 100 + parseDurationMinutes(f.duration) * 0.3,
    }));
    scored.sort((a, b) => a.score - b.score);
    const firstFlight = flights[0];
    if (!firstFlight) {
      throw new Error("Unexpected empty flights array");
    }
    const recommended = scored[0]?.flight ?? firstFlight;

    const summary = [
      `Found ${flights.length} flights from ${route.origin} to ${route.destination} on ${route.date}.`,
      `Cheapest: ${cheapest.airline} at $${cheapest.price} (${cheapest.duration}, ${cheapest.stops} stops).`,
      `Fastest: ${fastest.airline} at $${fastest.price} (${fastest.duration}).`,
      `Recommended: ${recommended.airline} at $${recommended.price} — best balance of price, duration, and convenience.`,
    ].join(" ");

    return {
      success: true,
      data: {
        route,
        flights,
        cheapest_option: cheapest,
        fastest_option: fastest,
        recommended_option: {
          ...recommended,
          reasoning: "Best balance of price, travel time, and number of stops",
        },
        total_options: flights.length,
      },
      summary,
      confidence,
      sources: [source],
      executionTime: 0,
    };
  }
}

/** Parses a duration string like "5h 30m" into total minutes. */
function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(\d+)h\s*(\d+)m/);
  if (!match) return UNPARSEABLE_DURATION_MINUTES;
  return parseInt(match[1] ?? "0", 10) * 60 + parseInt(match[2] ?? "0", 10);
}
