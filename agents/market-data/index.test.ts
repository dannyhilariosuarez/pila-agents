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

import { MarketDataAgent } from "./index.js";
import { marketDataManifest } from "./manifest.js";

// ── Helpers ──

function claudeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

const TAVILY_CONFIG = { apiKeys: { TAVILY_API_KEY: "test-tavily-key" } };
const NO_KEYS_CONFIG = { apiKeys: {} };

const SAMPLE_QUERY = {
  instruments: [
    { symbol: "AAPL", name: "Apple Inc.", type: "stock" },
  ],
  compare: false,
};

const SAMPLE_MULTI_QUERY = {
  instruments: [
    { symbol: "AAPL", name: "Apple Inc.", type: "stock" },
    { symbol: "MSFT", name: "Microsoft Corp.", type: "stock" },
    { symbol: "GOOGL", name: "Alphabet Inc.", type: "stock" },
  ],
  compare: true,
};

const SAMPLE_INSTRUMENTS = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
    price: 185.5,
    currency: "USD",
    change_24h: 2.3,
    change_24h_percent: 1.25,
    market_cap: 2900000000000,
    volume_24h: 55000000,
    high_24h: 186.0,
    low_24h: 183.2,
  },
];

const SAMPLE_MULTI_INSTRUMENTS = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
    price: 185.5,
    currency: "USD",
    change_24h: 2.3,
    change_24h_percent: 1.25,
    market_cap: 2900000000000,
    volume_24h: 55000000,
    high_24h: 186.0,
    low_24h: 183.2,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    type: "stock",
    price: 420.0,
    currency: "USD",
    change_24h: -3.5,
    change_24h_percent: -0.83,
    market_cap: 3100000000000,
    volume_24h: 22000000,
    high_24h: 424.0,
    low_24h: 418.5,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    type: "stock",
    price: 175.2,
    currency: "USD",
    change_24h: 4.1,
    change_24h_percent: 2.4,
    market_cap: 2200000000000,
    volume_24h: 28000000,
    high_24h: 176.0,
    low_24h: 171.0,
  },
];

function tavilyResponse(results = [{ title: "Market Data", content: "AAPL is at $185.50", url: "https://example.com" }]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => JSON.stringify({ results }),
  };
}

// ── Tests ──

describe("MarketDataAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- Manifest ----------

  describe("manifest", () => {
    it("has correct id and name", () => {
      const agent = new MarketDataAgent();
      expect(agent.manifest.id).toBe("market-data-agent");
      expect(agent.manifest.name).toBe("Market Data Agent");
    });

    it("has category Finance", () => {
      const agent = new MarketDataAgent();
      expect(agent.manifest.category).toBe("Finance");
    });

    it("has expected capabilities", () => {
      const agent = new MarketDataAgent();
      expect(agent.manifest.capabilities).toContain("Retrieve stock prices");
      expect(agent.manifest.capabilities).toContain("Track cryptocurrency values");
      expect(agent.manifest.capabilities).toContain("Analyze market indices");
      expect(agent.manifest.capabilities).toContain("Compare financial instruments");
    });

    it("matches the imported manifest object", () => {
      const agent = new MarketDataAgent();
      expect(agent.manifest).toEqual(marketDataManifest);
    });
  });

  // ---------- Validation ----------

  describe("validate", () => {
    it("requires both task and subTask", () => {
      const agent = new MarketDataAgent();
      expect(agent.validate({ task: "get stock price", subTask: "check AAPL" })).toBe(true);
      expect(agent.validate({ task: "", subTask: "check AAPL" })).toBe(false);
      expect(agent.validate({ task: "get stock price", subTask: "" })).toBe(false);
    });
  });

  // ---------- Tavily path ----------

  describe("run with Tavily", () => {
    it("returns successful results with instrument data", async () => {
      const agent = new MarketDataAgent(TAVILY_CONFIG);

      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_QUERY)));
      mockFetch.mockResolvedValueOnce(tavilyResponse());
      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_INSTRUMENTS)));

      const result = await agent.run({
        task: "What is the current price of Apple stock?",
        subTask: "Get AAPL price",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.8);

      const data = result.data as Record<string, unknown>;
      expect((data.instruments as unknown[]).length).toBe(1);
      expect(data.total_instruments).toBe(1);

      const primary = data.primary_instrument as { symbol: string; price: number };
      expect(primary.symbol).toBe("AAPL");
      expect(primary.price).toBe(185.5);
    });

    it("returns failure when no instruments found", async () => {
      const agent = new MarketDataAgent(TAVILY_CONFIG);

      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_QUERY)));
      mockFetch.mockResolvedValueOnce(tavilyResponse());
      mockCreate.mockResolvedValueOnce(claudeTextResponse("[]"));

      const result = await agent.run({
        task: "What is the price of XYZ?",
        subTask: "Get unknown instrument",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No market data returned");
      expect(result.confidence).toBe(0);
    });

    it("throws when TAVILY_API_KEY is not set", async () => {
      const agent = new MarketDataAgent(NO_KEYS_CONFIG);
      const savedKey = process.env.TAVILY_API_KEY;
      delete process.env.TAVILY_API_KEY;
      try {
        mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_QUERY)));

        await expect(
          agent.run({
            task: "Get AAPL price",
            subTask: "Check stock",
          }),
        ).rejects.toThrow("TAVILY_API_KEY not set");
      } finally {
        if (savedKey) process.env.TAVILY_API_KEY = savedKey;
      }
    });

    it("throws when Tavily API returns an error", async () => {
      const agent = new MarketDataAgent(TAVILY_CONFIG);

      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_QUERY)));
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        agent.run({
          task: "Get AAPL price",
          subTask: "Check stock",
        }),
      ).rejects.toThrow("Tavily returned 500");
    });
  });

  // ---------- Comparison / multi-instrument ----------

  describe("comparison mode", () => {
    it("returns comparison data when multiple instruments are compared", async () => {
      const agent = new MarketDataAgent(TAVILY_CONFIG);

      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_MULTI_QUERY)));
      mockFetch.mockResolvedValueOnce(tavilyResponse());
      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_MULTI_INSTRUMENTS)));

      const result = await agent.run({
        task: "Compare AAPL, MSFT, and GOOGL",
        subTask: "Compare stock performance",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect((data.instruments as unknown[]).length).toBe(3);

      const comparison = data.comparison as {
        best_performer: { symbol: string };
        worst_performer: { symbol: string };
      };
      expect(comparison.best_performer.symbol).toBe("GOOGL");
      expect(comparison.worst_performer.symbol).toBe("MSFT");
    });
  });

  // ---------- Summary formatting ----------

  describe("summary", () => {
    it("includes instrument name, price, and change in summary text", async () => {
      const agent = new MarketDataAgent(TAVILY_CONFIG);

      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_QUERY)));
      mockFetch.mockResolvedValueOnce(tavilyResponse());
      mockCreate.mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_INSTRUMENTS)));

      const result = await agent.run({
        task: "Get Apple stock price",
        subTask: "Check AAPL",
      });

      expect(result.summary).toContain("1 instrument");
      expect(result.summary).toContain("Apple Inc.");
      expect(result.summary).toContain("AAPL");
      expect(result.summary).toContain("$185.5");
      expect(result.summary).toContain("+1.25%");
      expect(result.summary).toContain("Market cap");
    });
  });
});
