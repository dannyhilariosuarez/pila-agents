import { describe, it, expect, vi } from "vitest";

vi.mock("@pila/protocol", () => ({
  registerAgent: vi.fn().mockResolvedValue({ success: true, agentId: "test-hotel-id" }),
  PilaBaseAgent: class {
    manifest = {};
    static loadEnv() {}
  },
}));

describe("hotel-search register", () => {
  it("module exports are importable", async () => {
    const { HotelSearchAgent } = await import("./index.js");
    expect(HotelSearchAgent).toBeDefined();
  });

  it("agent instantiates with correct manifest id", async () => {
    const { hotelSearchManifest } = await import("./manifest.js");
    expect(hotelSearchManifest.id).toBe("hotel-search-agent");
  });
});
