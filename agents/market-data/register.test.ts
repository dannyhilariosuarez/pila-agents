import { describe, it, expect, vi } from "vitest";

vi.mock("@pila/protocol", () => ({
  registerAgent: vi.fn().mockResolvedValue({ success: true, agentId: "test-market-id" }),
  PilaBaseAgent: class {
    manifest = {};
    static loadEnv() {}
  },
}));

describe("market-data register", () => {
  it("module exports are importable", async () => {
    const { MarketDataAgent } = await import("./index.js");
    expect(MarketDataAgent).toBeDefined();
  });

  it("agent instantiates with correct manifest id", async () => {
    const { marketDataManifest } = await import("./manifest.js");
    expect(marketDataManifest.id).toBe("market-data-agent");
  });
});
