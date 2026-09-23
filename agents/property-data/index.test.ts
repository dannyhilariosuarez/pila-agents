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

// ── Mock process.stdout.write so agent logging doesn't pollute test output ──
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

import { PropertyDataAgent } from "./index.js";
import { propertyDataManifest } from "./manifest.js";

// ── Helpers ──

function claudeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function tavilyResponse(
  results: Array<{ title: string; content: string; url: string }>,
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => JSON.stringify({ results }),
  };
}

const TAVILY_CONFIG = { apiKeys: { TAVILY_API_KEY: "test-tavily-key" } };
const NO_KEYS_CONFIG = { apiKeys: {} };

const SAMPLE_ADDRESS = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip: "78701",
  fullAddress: "123 Main St, Austin, TX 78701",
};

const SAMPLE_VALUE = { amount: 450000, currency: "USD" };

const SAMPLE_COMPARABLES = [
  {
    address: "125 Main St, Austin, TX",
    salePrice: 420000,
    saleDate: "2025-12",
    squareFeet: 1800,
    bedrooms: 3,
    bathrooms: 2,
  },
];

const SAMPLE_NEIGHBORHOOD = {
  medianHomeValue: 400000,
  medianRent: 2000,
  avgPricePerSqFt: 220,
  yearOverYearAppreciation: "4.5%",
  walkScore: 68,
};

const SAMPLE_DETAILS = {
  squareFeet: 2000,
  bedrooms: 3,
  bathrooms: 2,
  yearBuilt: 2005,
  lotSize: "0.2 acres",
  propertyType: "Single Family",
};

function setupMocks() {
  // Claude calls (in order): parseAddress, value, comparables, neighborhood, details
  mockCreate
    .mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_ADDRESS)))
    .mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_VALUE)))
    .mockResolvedValueOnce(
      claudeTextResponse(JSON.stringify(SAMPLE_COMPARABLES)),
    )
    .mockResolvedValueOnce(
      claudeTextResponse(JSON.stringify(SAMPLE_NEIGHBORHOOD)),
    )
    .mockResolvedValueOnce(claudeTextResponse(JSON.stringify(SAMPLE_DETAILS)));

  // Tavily fetch calls (4 parallel searches)
  mockFetch.mockResolvedValue(
    tavilyResponse([
      {
        title: "Zillow listing",
        content: "Property valued at $450,000",
        url: "https://zillow.com/123",
      },
    ]),
  );
}

// ── Tests ──

describe("PropertyDataAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- Manifest ----------

  describe("manifest", () => {
    it("has correct id", () => {
      const agent = new PropertyDataAgent();
      expect(agent.manifest.id).toBe("property-data-agent");
    });

    it("has category RealEstate", () => {
      const agent = new PropertyDataAgent();
      expect(agent.manifest.category).toBe("RealEstate");
    });

    it("has expected capabilities", () => {
      const agent = new PropertyDataAgent();
      expect(agent.manifest.capabilities).toContain(
        "Retrieve property valuations",
      );
      expect(agent.manifest.capabilities).toContain("Search comparable sales");
      expect(agent.manifest.capabilities).toContain(
        "Analyze neighborhood data",
      );
      expect(agent.manifest.capabilities).toContain("Look up property details");
    });

    it("matches the imported manifest object", () => {
      const agent = new PropertyDataAgent();
      expect(agent.manifest).toEqual(propertyDataManifest);
    });
  });

  // ---------- Validation ----------

  describe("validate", () => {
    it("requires both task and subTask", () => {
      const agent = new PropertyDataAgent();
      expect(
        agent.validate({ task: "check property", subTask: "get value" }),
      ).toBe(true);
      expect(agent.validate({ task: "", subTask: "get value" })).toBe(false);
      expect(agent.validate({ task: "check property", subTask: "" })).toBe(
        false,
      );
    });
  });

  // ---------- run() with mocked APIs ----------

  describe("run", () => {
    it("returns successful property data when all searches succeed", async () => {
      setupMocks();
      const agent = new PropertyDataAgent(TAVILY_CONFIG);

      const result = await agent.run({
        task: "What is the value of 123 Main St, Austin TX?",
        subTask: "Look up property value and details",
      });

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.8);

      const data = result.data as Record<string, unknown>;
      expect(data.address).toEqual(SAMPLE_ADDRESS);
      expect(data.estimatedValue).toEqual(SAMPLE_VALUE);
      expect(data.propertyDetails).toEqual(SAMPLE_DETAILS);
      expect(result.summary).toContain("$450,000");
      expect(result.sources).toBeDefined();
      expect(result.sources?.length).toBeGreaterThan(0);
    });

    it("returns failure when estimated value is 0", async () => {
      const agent = new PropertyDataAgent(TAVILY_CONFIG);

      mockCreate
        .mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_ADDRESS)),
        )
        .mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify({ amount: 0, currency: "USD" })),
        )
        .mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_COMPARABLES)),
        )
        .mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_NEIGHBORHOOD)),
        )
        .mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_DETAILS)),
        );

      mockFetch.mockResolvedValue(
        tavilyResponse([
          { title: "Result", content: "No data", url: "https://example.com" },
        ]),
      );

      const result = await agent.run({
        task: "What is the value of 999 Unknown Rd?",
        subTask: "Look up property value",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Unable to estimate property value from search results",
      );
      expect(result.confidence).toBe(0);
    });

    it("throws when Tavily API key is not set", async () => {
      const agent = new PropertyDataAgent(NO_KEYS_CONFIG);
      const savedKey = process.env.TAVILY_API_KEY;
      delete process.env.TAVILY_API_KEY;
      try {
        mockCreate.mockResolvedValueOnce(
          claudeTextResponse(JSON.stringify(SAMPLE_ADDRESS)),
        );

        await expect(
          agent.run({
            task: "Check 123 Main St",
            subTask: "Get property data",
          }),
        ).rejects.toThrow("TAVILY_API_KEY not set");
      } finally {
        if (savedKey) process.env.TAVILY_API_KEY = savedKey;
      }
    });

    it("calls Claude to parse the address from the task", async () => {
      setupMocks();
      const agent = new PropertyDataAgent(TAVILY_CONFIG);

      await agent.run({
        task: "What is the value of 123 Main St, Austin TX?",
        subTask: "Look up property value",
      });

      // First Claude call should be the address parsing
      const firstCall = mockCreate.mock.calls[0]?.[0];
      expect(firstCall.system).toContain("Extract a property address");
      expect(firstCall.messages[0].content).toContain("123 Main St, Austin TX");
    });

    it("runs all four Tavily searches in parallel", async () => {
      setupMocks();
      const agent = new PropertyDataAgent(TAVILY_CONFIG);

      await agent.run({
        task: "What is the value of 123 Main St?",
        subTask: "Full property analysis",
      });

      // 4 Tavily fetch calls (value, comparables, neighborhood, details)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
