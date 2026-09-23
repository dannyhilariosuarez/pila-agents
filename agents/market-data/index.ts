/** Market data agent — retrieves financial market data and analysis. */

import Anthropic from "@anthropic-ai/sdk";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { marketDataManifest } from "./manifest.js";

/** Market data for a single financial instrument. */
interface InstrumentData {
  symbol: string;
  name: string;
  type: "stock" | "crypto" | "index" | "etf" | "commodity";
  price: number;
  currency: string;
  change_24h: number;
  change_24h_percent: number;
  market_cap: number | null;
  volume_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
}

/** Structured financial query extracted from the user's request. */
interface ParsedQuery {
  instruments: Array<{
    symbol: string;
    name: string;
    type: "stock" | "crypto" | "index" | "etf" | "commodity";
  }>;
  compare: boolean;
}

const anthropic = new Anthropic();

/** Claude model used for query parsing and data extraction. */
const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;
/** Maximum number of Tavily search results to fetch. */
const MAX_SEARCH_RESULTS = 5;

/** Use Claude to extract financial instrument identifiers from a natural-language query. */
async function parseQueryWithClaude(
  task: string,
  subTask: string,
): Promise<ParsedQuery> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: `Extract financial instrument identifiers from the user's request. Return ONLY valid JSON:
{
  "instruments": [
    { "symbol": "AAPL", "name": "Apple Inc.", "type": "stock" }
  ],
  "compare": false
}
type must be one of: "stock", "crypto", "index", "etf", "commodity".
Use standard ticker symbols (e.g., AAPL, BTC, ^GSPC for S&P 500, ^DJI for Dow Jones).
Set compare to true if the user wants to compare multiple instruments.`,
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
  return JSON.parse(cleaned.slice(start, end + 1)) as ParsedQuery;
}

/** Search Tavily for current market data and use Claude to extract structured prices. */
async function searchTavily(
  query: ParsedQuery,
  apiKey: string,
): Promise<{
  instruments: InstrumentData[];
  source: string;
}> {
  const symbols = query.instruments.map((i) => i.symbol).join(", ");
  const searchQuery = `current price ${symbols} stock market data today`;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: searchQuery,
      search_depth: "advanced",
      max_results: MAX_SEARCH_RESULTS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily returned ${res.status}`);
  }

  const data = (await res.json()) as {
    results: Array<{ title: string; content: string; url: string }>;
  };

  // Use Claude to extract structured market data from search results
  const searchContent = data.results
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const instrumentList = query.instruments
    .map((i) => `${i.symbol} (${i.name}, ${i.type})`)
    .join(", ");

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `Extract financial market data from the search results. Return ONLY a JSON array of instrument data:
[{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "type": "stock",
  "price": 185.50,
  "currency": "USD",
  "change_24h": 2.30,
  "change_24h_percent": 1.25,
  "market_cap": 2900000000000,
  "volume_24h": 55000000,
  "high_24h": 186.00,
  "low_24h": 183.20
}]
Use null for any values you cannot determine from the search results.
Provide your best estimates based on the available information.`,
    messages: [
      {
        role: "user",
        content: `Extract market data for: ${instrumentList}\n\nSearch results:\n\n${searchContent}`,
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
  const instruments = JSON.parse(
    cleaned.slice(start, end + 1),
  ) as InstrumentData[];

  return {
    instruments,
    source: `Tavily search: ${searchQuery}`,
  };
}

/** Fetches financial market data, stock prices, and cryptocurrency rates. */
export class MarketDataAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = marketDataManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing financial query...");
    const query = await parseQueryWithClaude(input.task, input.subTask);
    this.log(
      `Instruments: ${query.instruments.map((i) => i.symbol).join(", ")}`,
    );

    let instruments: InstrumentData[];
    let source: string;

    try {
      const tavilyKey = this.getApiKey("TAVILY_API_KEY");
      const result = await searchTavily(query, tavilyKey);
      instruments = result.instruments;
      source = result.source;
      this.log(`Tavily returned data for ${instruments.length} instruments`);
    } catch (err) {
      throw new Error(
        `Market data fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (instruments.length === 0) {
      return {
        success: false,
        data: { query },
        summary: `No market data found for ${query.instruments.map((i) => i.symbol).join(", ")}.`,
        confidence: 0,
        sources: [source],
        executionTime: 0,
        error: "No market data returned",
      };
    }

    const primary = instruments[0];
    if (!primary) {
      throw new Error("Unexpected empty instruments array");
    }

    // Build comparison data if multiple instruments
    const comparison =
      query.compare && instruments.length > 1
        ? {
            best_performer: instruments.reduce((a, b) =>
              a.change_24h_percent > b.change_24h_percent ? a : b,
            ),
            worst_performer: instruments.reduce((a, b) =>
              a.change_24h_percent < b.change_24h_percent ? a : b,
            ),
          }
        : null;

    const summaryParts = [
      `Retrieved market data for ${instruments.length} instrument${instruments.length > 1 ? "s" : ""}.`,
      `${primary.name} (${primary.symbol}): $${primary.price} ${primary.currency}, ${primary.change_24h_percent >= 0 ? "+" : ""}${primary.change_24h_percent}% today.`,
    ];

    if (primary.market_cap) {
      summaryParts.push(
        `Market cap: $${formatLargeNumber(primary.market_cap)}.`,
      );
    }

    if (comparison) {
      summaryParts.push(
        `Best performer: ${comparison.best_performer.symbol} (${comparison.best_performer.change_24h_percent >= 0 ? "+" : ""}${comparison.best_performer.change_24h_percent}%).`,
      );
    }

    return {
      success: true,
      data: {
        query: {
          instruments: query.instruments,
          compare: query.compare,
        },
        instruments,
        primary_instrument: primary,
        ...(comparison ? { comparison } : {}),
        total_instruments: instruments.length,
      },
      summary: summaryParts.join(" "),
      confidence: 0.8,
      sources: [source],
      executionTime: 0,
    };
  }
}

/** Formats a large number with T/B/M suffixes for human readability. */
function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}
