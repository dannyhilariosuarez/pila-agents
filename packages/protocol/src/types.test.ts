import { describe, it, expect } from "vitest";
import type {
  PilaCategory,
  PilaInputSchema,
  PilaOutputSchema,
  PilaAgentManifest,
  AgentConfig,
} from "./types.js";

describe("PilaCategory", () => {
  it("allows all 10 categories", () => {
    const categories: PilaCategory[] = [
      "Research",
      "Finance",
      "Legal",
      "Media",
      "Marketing",
      "Operations",
      "Technical",
      "Communications",
      "Travel",
      "RealEstate",
    ];
    expect(categories).toHaveLength(10);
  });
});

describe("PilaInputSchema", () => {
  it("requires task and subTask", () => {
    const input: PilaInputSchema = { task: "test", subTask: "sub" };
    expect(input.task).toBe("test");
    expect(input.subTask).toBe("sub");
  });

  it("allows optional context and parameters", () => {
    const input: PilaInputSchema = {
      task: "test",
      subTask: "sub",
      context: "ctx",
      parameters: { key: "value" },
    };
    expect(input.context).toBe("ctx");
    expect(input.parameters).toEqual({ key: "value" });
  });
});

describe("PilaOutputSchema", () => {
  it("has required fields", () => {
    const output: PilaOutputSchema = {
      success: true,
      data: { result: 42 },
      summary: "done",
      confidence: 0.95,
      executionTime: 150,
    };
    expect(output.success).toBe(true);
    expect(output.confidence).toBe(0.95);
  });

  it("allows optional sources and error", () => {
    const output: PilaOutputSchema = {
      success: false,
      data: {},
      summary: "failed",
      confidence: 0,
      executionTime: 0,
      sources: ["api"],
      error: "timeout",
    };
    expect(output.error).toBe("timeout");
    expect(output.sources).toContain("api");
  });
});

describe("PilaAgentManifest", () => {
  it("requires all manifest fields", () => {
    const manifest: PilaAgentManifest = {
      id: "test-agent",
      name: "Test Agent",
      version: "1.0.0",
      author: "pila",
      description: "A test agent",
      category: "Research",
      capabilities: ["search"],
      inputSchema: { task: "", subTask: "" },
      outputSchema: {
        success: true,
        data: {},
        summary: "",
        confidence: 0,
        executionTime: 0,
      },
      pricing: { perExecution: 10, currency: "USD" },
      tags: ["test"],
    };
    expect(manifest.id).toBe("test-agent");
    expect(manifest.category).toBe("Research");
    expect(manifest.tags).toContain("test");
  });
});

describe("AgentConfig", () => {
  it("allows optional apiKeys", () => {
    const config: AgentConfig = {};
    expect(config.apiKeys).toBeUndefined();

    const configWithKeys: AgentConfig = {
      apiKeys: { TAVILY_API_KEY: "key" },
    };
    expect(configWithKeys.apiKeys?.TAVILY_API_KEY).toBe("key");
  });
});
