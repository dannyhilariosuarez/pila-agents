import { describe, it, expect } from "vitest";
import { hotelSearchManifest } from "./manifest.js";

describe("hotelSearchManifest", () => {
  it("has correct agent id", () => {
    expect(hotelSearchManifest.id).toBe("hotel-search-agent");
  });

  it("belongs to Travel category", () => {
    expect(hotelSearchManifest.category).toBe("Travel");
  });

  it("declares at least one capability", () => {
    expect(hotelSearchManifest.capabilities.length).toBeGreaterThan(0);
  });

  it("has valid pricing", () => {
    expect(hotelSearchManifest.pricing.perExecution).toBeGreaterThan(0);
    expect(hotelSearchManifest.pricing.currency).toBe("USD");
  });

  it("has required manifest fields", () => {
    expect(hotelSearchManifest.name).toBeTruthy();
    expect(hotelSearchManifest.version).toBeTruthy();
    expect(hotelSearchManifest.author).toBeTruthy();
    expect(hotelSearchManifest.description).toBeTruthy();
    expect(hotelSearchManifest.tags.length).toBeGreaterThan(0);
  });

  it("declares SerpAPI Google Hotels as source", () => {
    expect(hotelSearchManifest.outputSchema.sources).toContain(
      "SerpAPI Google Hotels",
    );
  });
});
