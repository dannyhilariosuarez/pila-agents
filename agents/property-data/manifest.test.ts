import { describe, it, expect } from "vitest";
import { propertyDataManifest } from "./manifest.js";

describe("propertyDataManifest", () => {
  it("has correct agent id", () => {
    expect(propertyDataManifest.id).toBe("property-data-agent");
  });

  it("belongs to RealEstate category", () => {
    expect(propertyDataManifest.category).toBe("RealEstate");
  });

  it("declares at least one capability", () => {
    expect(propertyDataManifest.capabilities.length).toBeGreaterThan(0);
  });

  it("has valid pricing", () => {
    expect(propertyDataManifest.pricing.perExecution).toBeGreaterThan(0);
    expect(propertyDataManifest.pricing.currency).toBe("USD");
  });

  it("has required manifest fields", () => {
    expect(propertyDataManifest.name).toBeTruthy();
    expect(propertyDataManifest.version).toBeTruthy();
    expect(propertyDataManifest.author).toBeTruthy();
    expect(propertyDataManifest.description).toBeTruthy();
    expect(propertyDataManifest.tags.length).toBeGreaterThan(0);
  });

  it("declares Tavily as source", () => {
    expect(propertyDataManifest.outputSchema.sources).toContain(
      "Tavily web search",
    );
  });
});
