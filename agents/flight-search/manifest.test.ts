import { describe, it, expect } from "vitest";
import { flightSearchManifest } from "./manifest.js";

describe("flightSearchManifest", () => {
  it("has correct agent id", () => {
    expect(flightSearchManifest.id).toBe("flight-search-agent");
  });

  it("belongs to Travel category", () => {
    expect(flightSearchManifest.category).toBe("Travel");
  });

  it("declares at least one capability", () => {
    expect(flightSearchManifest.capabilities.length).toBeGreaterThan(0);
  });

  it("has valid pricing", () => {
    expect(flightSearchManifest.pricing.perExecution).toBeGreaterThan(0);
    expect(flightSearchManifest.pricing.currency).toBe("USD");
  });

  it("has required manifest fields", () => {
    expect(flightSearchManifest.name).toBeTruthy();
    expect(flightSearchManifest.version).toBeTruthy();
    expect(flightSearchManifest.author).toBeTruthy();
    expect(flightSearchManifest.description).toBeTruthy();
    expect(flightSearchManifest.tags.length).toBeGreaterThan(0);
  });

  it("declares SerpAPI as source", () => {
    expect(flightSearchManifest.outputSchema.sources).toContain(
      "SerpAPI Google Flights",
    );
  });
});
