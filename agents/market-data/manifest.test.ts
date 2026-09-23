import { describe, it, expect } from "vitest";
import { marketDataManifest } from "./manifest.js";

describe("marketDataManifest", () => {
  it("has correct agent id", () => {
    expect(marketDataManifest.id).toBe("market-data-agent");
  });

  it("belongs to Finance category", () => {
    expect(marketDataManifest.category).toBe("Finance");
  });

  it("declares at least one capability", () => {
    expect(marketDataManifest.capabilities.length).toBeGreaterThan(0);
  });

  it("has valid pricing", () => {
    expect(marketDataManifest.pricing.perExecution).toBeGreaterThan(0);
    expect(marketDataManifest.pricing.currency).toBe("USD");
  });

  it("has required manifest fields", () => {
    expect(marketDataManifest.name).toBeTruthy();
    expect(marketDataManifest.version).toBeTruthy();
    expect(marketDataManifest.author).toBeTruthy();
    expect(marketDataManifest.description).toBeTruthy();
    expect(marketDataManifest.tags.length).toBeGreaterThan(0);
  });

  it("declares Tavily as source", () => {
    expect(marketDataManifest.outputSchema.sources).toContain(
      "Tavily web search",
    );
  });
});
