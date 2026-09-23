import { describe, it, expect, vi } from "vitest";

vi.mock("@pila/protocol", () => ({
  registerAgent: vi.fn().mockResolvedValue({ success: true, agentId: "test-property-id" }),
  PilaBaseAgent: class {
    manifest = {};
    static loadEnv() {}
  },
}));

describe("property-data register", () => {
  it("module exports are importable", async () => {
    const { PropertyDataAgent } = await import("./index.js");
    expect(PropertyDataAgent).toBeDefined();
  });

  it("agent instantiates with correct manifest id", async () => {
    const { propertyDataManifest } = await import("./manifest.js");
    expect(propertyDataManifest.id).toBe("property-data-agent");
  });
});
