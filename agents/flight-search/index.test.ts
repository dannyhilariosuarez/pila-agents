import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be declared before vi.mock) ──
const { mockCreate, mockFetch } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFetch: vi.fn(),
}));

// ── Mock Anthropic SDK ──
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});

// ── Mock global fetch ──
vi.stubGlobal("fetch", mockFetch);

// ── Suppress agent log output ──
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

import { FlightSearchAgent } from "./index.js";
import { flightSearchManifest } from "./manifest.js";

// ── Helpers ──

function claudeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

const SAMPLE_ROUTE = {
  origin: "JFK",
  destination: "NRT",
  date: "2026-04-01",
};

const SAMPLE_ROUND_TRIP_ROUTE = {
  origin: "JFK",
  destination: "NRT",
  date: "2026-04-01",
  return_date: "2026-04-08",
};

const SAMPLE_SERP_FLIGHTS = {
  best_flights: [
    {
      flights: [
        {
          airline: "Delta",
          departure_airport: { time: "10:00" },
          arrival_airport: { time: "14:30" },
        },
      ],
      price: 450,
      total_duration: 840,
      layovers: [],
    },
    {
      flights: [
        {
          airline: "United",
          departure_airport: { time: "08:00" },
          arrival_airport: { time: "11:00" },
        },
        {
          airline: "United",
          departure_airport: { time: "12:00" },
          arrival_airport: { time: "15:00" },
        },
      ],
      price: 380,
      total_duration: 960,
      layovers: [{}],
    },
  ],
  other_flights: [
    {
      flights: [
        {
          airline: "ANA",
          departure_airport: { time: "13:00" },
          arrival_airport: { time: "16:30" },
        },
      ],
      price: 520,
      total_duration: 780,
      layovers: [],
    },
  ],
};

const SAMPLE_TAVILY_FLIGHTS = [
  {
    airline: "Delta",
    price: 460,
    currency: "USD",
    duration: "14h 0m",
    stops: 0,
    departure_time: "10:00",
    arrival_time: "14:30",
  },
  {
    airline: "United",
    price: 390,
    currency: "USD",
    duration: "16h 0m",
    stops: 1,
    departure_time: "08:00",
    arrival_time: "15:00",
  },
];

// ── Config helpers ──
const SERP_CONFIG = {
  apiKeys: { SERPAPI_KEY: "test-serp-key", TAVILY_API_KEY: "test-tavily-key" },
};
const SERP_ONLY_CONFIG = { apiKeys: { SERPAPI_KEY: "test-serp-key" } };
const _TAVILY_ONLY_CONFIG = { apiKeys: { TAVILY_API_KEY: "test-tavily-key" } };
const NO_KEYS_CONFIG = { apiKeys: {} };

function serpApiResponse(data = SAMPLE_SERP_FLIGHTS) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function tavilyResponse(
  results = [
    { title: "Flights", content: "Delta $460", url: "https://example.com" },
  ],
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => JSON.stringify({ results }),
  };
}

// ── Tests ──

describe("FlightSearchAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- Manifest ----------

  describe("manifest", () => {
    it("has correct id and name", () => {
      const agent = new FlightSearchAgent();
      expect(agent.manifest.id).toBe("flight-search-agent");
      expect(agent.manifest.name).toBe("Flight Search Agent");
    });

    it("has category Travel", () => {
      const agent = new FlightSearchAgent();
      expect(agent.manifest.category).toBe("Travel");
    });

    it("has expected capabilities", () => {
      const agent = new FlightSearchAgent();
      expect(agent.manifest.capabilities).toContain("Search one-way flights");
      expect(agent.manifest.capabilities).toContain(
        "Search round-trip flights",
      );
      expect(agent.manifest.capabilities).toContain("Compare airlines");
      expect(agent.manifest.capabilities).toContain("Find cheapest dates");
      expect(agent.manifest.capabilities).toContain(
        "Return structured flight options",
      );
    });

    it("matches the imported manifest object", () => {
      const agent = new FlightSearchAgent();
      expect(agent.manifest).toEqual(flightSearchManifest);
    });
  });

  // ---------- Validation ----------

  describe("validate", () => {
    it("requires both task and subTask", () => {
      const agent = new FlightSearchAgent();
      expect(
        agent.validate({ task: "find flights", subTask: "search JFK to NRT" }),
      ).toBe(true);
      expect(agent.validate({ task: "", subTask: "search JFK to NRT" })).toBe(
        false,
      );
      expect(agent.validate({ task: "find flights", subTask: "" })).toBe(false);
    });
  });

  // ---------- SerpAPI path ----------

  describe("run with SerpAPI", () => {
    it("returns successful results with flight recommendations", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find flights from NYC to Tokyo in April",
        subTask: "Search for flights JFK to NRT",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(1.0);

      const data = result.data as Record<string, unknown>;
      expect((data.flights as unknown[]).length).toBe(3);
      expect(data.total_options).toBe(3);

      // Check cheapest is United ($380)
      const cheapest = data.cheapest_option as {
        airline: string;
        price: number;
      };
      expect(cheapest.airline).toBe("United");
      expect(cheapest.price).toBe(380);

      // Check fastest is ANA (780 min = 13h 0m)
      const fastest = data.fastest_option as {
        airline: string;
        duration: string;
      };
      expect(fastest.airline).toBe("ANA");
    });

    it("sends one-way type param when no return_date", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      await agent.run({
        task: "One-way flight to Tokyo",
        subTask: "Search JFK to NRT one-way",
      });

      const fetchUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(fetchUrl).toContain("type=2");
      expect(fetchUrl).not.toContain("return_date");
    });

    it("sends return_date param for round trips", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUND_TRIP_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      await agent.run({
        task: "Round trip to Tokyo",
        subTask: "Search JFK to NRT round trip April 1-8",
      });

      const fetchUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(fetchUrl).toContain("return_date=2026-04-08");
      expect(fetchUrl).not.toContain("type=2");
    });

    it("returns failure when no flights found", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(
        serpApiResponse({ best_flights: [], other_flights: [] }),
      );

      const result = await agent.run({
        task: "Find flights to nowhere",
        subTask: "Search flights",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No flight results returned");
      expect(result.confidence).toBe(0);
    });
  });

  // ---------- Scoring / recommendation logic ----------

  describe("flight scoring", () => {
    it("recommends the best value flight based on price, stops, and duration", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find flights to Tokyo",
        subTask: "Search flights",
      });

      // The scoring formula is: price * 0.5 + stops * 100 + duration_minutes * 0.3
      // Delta:  450 * 0.5 + 0 * 100 + 840 * 0.3 = 225 + 0 + 252 = 477
      // United: 380 * 0.5 + 1 * 100 + 960 * 0.3 = 190 + 100 + 288 = 578
      // ANA:    520 * 0.5 + 0 * 100 + 780 * 0.3 = 260 + 0 + 234 = 494
      // Delta should be recommended (lowest score = 477)
      const data = result.data as Record<string, unknown>;
      const recommended = data.recommended_option as {
        airline: string;
        reasoning: string;
      };
      expect(recommended.airline).toBe("Delta");
      expect(recommended.reasoning).toBe(
        "Best balance of price, travel time, and number of stops",
      );
    });
  });

  // ---------- Tavily fallback path ----------

  describe("Tavily fallback", () => {
    it("falls back to Tavily when SerpAPI fails", async () => {
      const agent = new FlightSearchAgent(SERP_CONFIG);

      // Parse route
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );

      // SerpAPI fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      // Tavily succeeds
      mockFetch.mockResolvedValueOnce(tavilyResponse());

      // Claude extracts flights from Tavily results
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_TAVILY_FLIGHTS)),
      );

      const result = await agent.run({
        task: "Find flights to Tokyo",
        subTask: "Search for flights JFK to NRT",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.5); // Lower confidence for Tavily fallback
      const data = result.data as Record<string, unknown>;
      expect((data.flights as unknown[]).length).toBe(2);
    });

    it("throws when both SerpAPI and Tavily fail", async () => {
      const agent = new FlightSearchAgent(SERP_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );

      // SerpAPI fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "SerpAPI down",
      });

      // Tavily also fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Tavily down",
      });

      await expect(
        agent.run({
          task: "Find flights",
          subTask: "Search",
        }),
      ).rejects.toThrow("Both SerpAPI and Tavily failed");
    });

    it("throws when no API keys are set", async () => {
      const agent = new FlightSearchAgent(NO_KEYS_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );

      await expect(
        agent.run({
          task: "Find flights",
          subTask: "Search",
        }),
      ).rejects.toThrow();
    });

    it("uses Tavily when SERPAPI_KEY is absent but TAVILY_API_KEY is present", async () => {
      // Both keys set, but SerpAPI fails at HTTP level → same as missing key scenario
      const agent = new FlightSearchAgent(SERP_CONFIG);

      // parseRouteWithClaude
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      // SerpAPI HTTP fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden — bad key",
      });
      // Tavily search
      mockFetch.mockResolvedValueOnce(tavilyResponse());
      // Claude extracts flights
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_TAVILY_FLIGHTS)),
      );

      const result = await agent.run({
        task: "Find flights",
        subTask: "Search JFK to NRT",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.5);
    });
  });

  // ---------- Summary formatting ----------

  describe("summary", () => {
    it("includes cheapest, fastest, and recommended in summary text", async () => {
      const agent = new FlightSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_ROUTE)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find flights to Tokyo",
        subTask: "Search",
      });

      expect(result.summary).toContain("3 flights");
      expect(result.summary).toContain("Cheapest:");
      expect(result.summary).toContain("Fastest:");
      expect(result.summary).toContain("Recommended:");
    });
  });
});
