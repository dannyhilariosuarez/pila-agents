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

import { HotelSearchAgent } from "./index.js";
import { hotelSearchManifest } from "./manifest.js";

// ── Helpers ──

function claudeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

const SAMPLE_SEARCH = {
  destination: "Paris",
  check_in: "2026-04-01",
  check_out: "2026-04-05",
  guests: 2,
};

const SAMPLE_SERP_PROPERTIES = [
  {
    name: "Hotel Le Marais",
    rate_per_night: { lowest: "$180", extracted_lowest: 180 },
    overall_rating: 4.5,
    amenities: ["WiFi", "Pool", "Breakfast"],
    neighborhood: "Le Marais",
    link: "https://hotels.com/le-marais",
  },
  {
    name: "Budget Inn Paris",
    rate_per_night: { lowest: "$90", extracted_lowest: 90 },
    overall_rating: 3.8,
    amenities: ["WiFi"],
    neighborhood: "Montmartre",
    link: "https://hotels.com/budget-inn",
  },
  {
    name: "Grand Palace Hotel",
    rate_per_night: { lowest: "$350", extracted_lowest: 350 },
    overall_rating: 4.9,
    amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"],
    neighborhood: "Champs-Élysées",
    link: "https://hotels.com/grand-palace",
  },
];

function serpApiResponse(properties = SAMPLE_SERP_PROPERTIES) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ properties }),
    text: async () => JSON.stringify({ properties }),
  };
}

const SAMPLE_TAVILY_HOTELS = [
  {
    name: "Tavily Hotel A",
    price: 120,
    currency: "USD",
    rating: 4.2,
    amenities: ["WiFi"],
    location: "Paris",
    bookingUrl: "https://example.com/a",
  },
  {
    name: "Tavily Hotel B",
    price: 200,
    currency: "USD",
    rating: 4.6,
    amenities: ["WiFi", "Pool"],
    location: "Paris",
    bookingUrl: "https://example.com/b",
  },
];

// ── Config helpers ──
const SERP_CONFIG = {
  apiKeys: { SERPAPI_KEY: "test-serp-key", TAVILY_API_KEY: "test-tavily-key" },
};
const SERP_ONLY_CONFIG = { apiKeys: { SERPAPI_KEY: "test-serp-key" } };
const NO_KEYS_CONFIG = { apiKeys: {} };

// ── Tests ──

describe("HotelSearchAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- Manifest ----------

  describe("manifest", () => {
    it("has correct id and name", () => {
      const agent = new HotelSearchAgent();
      expect(agent.manifest.id).toBe("hotel-search-agent");
      expect(agent.manifest.name).toBe("Hotel Search Agent");
    });

    it("has category Travel", () => {
      const agent = new HotelSearchAgent();
      expect(agent.manifest.category).toBe("Travel");
    });

    it("has expected capabilities", () => {
      const agent = new HotelSearchAgent();
      expect(agent.manifest.capabilities).toContain(
        "Search hotel availability",
      );
      expect(agent.manifest.capabilities).toContain("Compare hotel prices");
      expect(agent.manifest.capabilities).toContain(
        "Find accommodations by budget",
      );
      expect(agent.manifest.capabilities).toContain(
        "Retrieve hotel ratings and reviews",
      );
    });

    it("matches the imported manifest object", () => {
      const agent = new HotelSearchAgent();
      expect(agent.manifest).toEqual(hotelSearchManifest);
    });
  });

  // ---------- Validation ----------

  describe("validate", () => {
    it("requires both task and subTask", () => {
      const agent = new HotelSearchAgent();
      expect(
        agent.validate({ task: "find hotels", subTask: "search Paris" }),
      ).toBe(true);
      expect(agent.validate({ task: "", subTask: "search Paris" })).toBe(false);
      expect(agent.validate({ task: "find hotels", subTask: "" })).toBe(false);
    });
  });

  // ---------- SerpAPI path ----------

  describe("run with SerpAPI", () => {
    it("returns successful results with hotel recommendations", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find hotels in Paris for April 1-5",
        subTask: "Search for hotel availability",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(1.0);

      const data = result.data as Record<string, unknown>;
      expect((data.hotels as unknown[]).length).toBe(3);
      expect(data.total_options).toBe(3);

      // Check cheapest is Budget Inn ($90)
      const cheapest = data.cheapest_option as { name: string; price: number };
      expect(cheapest.name).toBe("Budget Inn Paris");
      expect(cheapest.price).toBe(90);

      // Check highest rated is Grand Palace (4.9)
      const highestRated = data.highest_rated as {
        name: string;
        rating: number;
      };
      expect(highestRated.name).toBe("Grand Palace Hotel");
      expect(highestRated.rating).toBe(4.9);
    });

    it("returns failure when no hotels found", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse([]));

      const result = await agent.run({
        task: "Find hotels in Antarctica",
        subTask: "Search for hotels",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No hotel results returned");
      expect(result.confidence).toBe(0);
    });

    it("includes budget in SerpAPI params when specified", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      const searchWithBudget = { ...SAMPLE_SEARCH, budget: 200 };
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(searchWithBudget)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      await agent.run({
        task: "Find hotels in Paris under $200/night",
        subTask: "Budget hotel search",
      });

      const fetchUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(fetchUrl).toContain("max_price=200");
    });
  });

  // ---------- Scoring / recommendation logic ----------

  describe("hotel scoring", () => {
    it("recommends the best value hotel based on price and rating", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find hotels in Paris",
        subTask: "Search hotels",
      });

      // The scoring formula is: price * 0.4 + (5 - rating) * 80 + (amenities.length > 0 ? 0 : 50)
      // Budget Inn:  90 * 0.4 + (5 - 3.8) * 80 + 0 = 36 + 96 = 132
      // Le Marais:   180 * 0.4 + (5 - 4.5) * 80 + 0 = 72 + 40 = 112
      // Grand Palace: 350 * 0.4 + (5 - 4.9) * 80 + 0 = 140 + 8 = 148
      // Le Marais should be recommended (lowest score = 112)
      const data = result.data as Record<string, unknown>;
      const recommended = data.recommended_option as {
        name: string;
        reasoning: string;
      };
      expect(recommended.name).toBe("Hotel Le Marais");
      expect(recommended.reasoning).toBe(
        "Best balance of price, rating, and amenities",
      );
    });
  });

  // ---------- Tavily fallback path ----------

  describe("Tavily fallback", () => {
    it("falls back to Tavily when SerpAPI fails", async () => {
      const agent = new HotelSearchAgent(SERP_CONFIG);

      // Parse search params
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );

      // SerpAPI fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      // Tavily succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: "Hotels in Paris",
              content: "Great options available",
              url: "https://example.com",
            },
          ],
        }),
        text: async () => "ok",
      });

      // Claude extracts hotels from Tavily results
      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_TAVILY_HOTELS)),
      );

      const result = await agent.run({
        task: "Find hotels in Paris",
        subTask: "Search for hotels",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.6); // Lower confidence for Tavily fallback
      const data = result.data as Record<string, unknown>;
      expect((data.hotels as unknown[]).length).toBe(2);
    });

    it("throws when both SerpAPI and Tavily fail", async () => {
      const agent = new HotelSearchAgent(SERP_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
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
          task: "Find hotels",
          subTask: "Search",
        }),
      ).rejects.toThrow("Both SerpAPI and Tavily failed");
    });

    it("throws when SerpAPI key is missing and Tavily key is also missing", async () => {
      const agent = new HotelSearchAgent(NO_KEYS_CONFIG);
      const savedSerpKey = process.env.SERPAPI_KEY;
      const savedTavilyKey = process.env.TAVILY_API_KEY;
      delete process.env.SERPAPI_KEY;
      delete process.env.TAVILY_API_KEY;
      try {
        // Neither key set — SerpAPI throws, then Tavily fallback also throws
        mockCreate.mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
        );

        await expect(
          agent.run({
            task: "Find hotels",
            subTask: "Search",
          }),
        ).rejects.toThrow();
      } finally {
        if (savedSerpKey) process.env.SERPAPI_KEY = savedSerpKey;
        if (savedTavilyKey) process.env.TAVILY_API_KEY = savedTavilyKey;
      }
    });
  });

  // ---------- Price filtering ----------

  describe("price filtering", () => {
    it("filters out hotels with missing price data", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      const propertiesWithMissing = [
        ...SAMPLE_SERP_PROPERTIES,
        {
          name: "No Price Hotel",
          overall_rating: 4.0,
          amenities: ["WiFi"],
          neighborhood: "Paris",
          rate_per_night: { lowest: "", extracted_lowest: 0 },
          link: "",
        },
        {
          name: "Zero Price Hotel",
          rate_per_night: { lowest: "$0", extracted_lowest: 0 },
          overall_rating: 3.5,
          amenities: [],
          neighborhood: "Paris",
          link: "",
        },
      ];

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse(propertiesWithMissing));

      const result = await agent.run({
        task: "Find hotels in Paris",
        subTask: "Search hotels",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const hotels = data.hotels as Array<{ name: string }>;
      expect(hotels.length).toBe(3);
      expect(hotels.map((h) => h.name)).not.toContain("No Price Hotel");
      expect(hotels.map((h) => h.name)).not.toContain("Zero Price Hotel");
    });
  });

  // ---------- Rating rounding ----------

  describe("rating rounding", () => {
    it("rounds floating-point ratings to 1 decimal place", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      const propertiesWithFloats = [
        {
          name: "Float Rating Hotel",
          rate_per_night: { lowest: "$150", extracted_lowest: 150 },
          overall_rating: 4.8599997,
          amenities: ["WiFi"],
          neighborhood: "Shibuya",
          link: "https://hotels.com/float",
        },
        {
          name: "Clean Rating Hotel",
          rate_per_night: { lowest: "$200", extracted_lowest: 200 },
          overall_rating: 4.5,
          amenities: ["WiFi", "Pool"],
          neighborhood: "Shinjuku",
          link: "https://hotels.com/clean",
        },
      ];

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse(propertiesWithFloats));

      const result = await agent.run({
        task: "Find hotels in Tokyo",
        subTask: "Search hotels",
      });

      const data = result.data as Record<string, unknown>;
      const hotels = data.hotels as Array<{ name: string; rating: number }>;

      const floatHotel = hotels.find((h) => h.name === "Float Rating Hotel");
      expect(floatHotel).toBeDefined();
      expect(floatHotel?.rating).toBe(4.9);

      const cleanHotel = hotels.find((h) => h.name === "Clean Rating Hotel");
      expect(cleanHotel).toBeDefined();
      expect(cleanHotel?.rating).toBe(4.5);

      // Summary should show clean numbers
      expect(result.summary).not.toContain("4.8599997");
      expect(result.summary).toContain("4.9");
    });
  });

  // ---------- Summary formatting ----------

  describe("summary", () => {
    it("includes cheapest, highest rated, and recommended in summary text", async () => {
      const agent = new HotelSearchAgent(SERP_ONLY_CONFIG);

      mockCreate.mockResolvedValueOnce(
        claudeTextResponse(JSON.stringify(SAMPLE_SEARCH)),
      );
      mockFetch.mockResolvedValueOnce(serpApiResponse());

      const result = await agent.run({
        task: "Find hotels in Paris",
        subTask: "Search",
      });

      expect(result.summary).toContain("3 hotels");
      expect(result.summary).toContain("Cheapest:");
      expect(result.summary).toContain("Highest rated:");
      expect(result.summary).toContain("Recommended:");
    });
  });
});
