import { describe, it, expect, vi } from "vitest";

vi.mock("@pila/protocol", () => ({
  registerAgent: vi.fn().mockResolvedValue({ success: true, agentId: "test-flight-id" }),
  PilaBaseAgent: class {
    manifest = {};
    static loadEnv() {}
  },
}));

describe("flight-search register", () => {
  it("module exports are importable", async () => {
    const { FlightSearchAgent } = await import("./index.js");
    expect(FlightSearchAgent).toBeDefined();
  });

  it("agent instantiates with correct manifest id", async () => {
    const { flightSearchManifest } = await import("./manifest.js");
    expect(flightSearchManifest.id).toBe("flight-search-agent");
  });
});
