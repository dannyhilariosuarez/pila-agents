import { describe, it, expect, afterEach, vi } from "vitest";
import { PilaBaseAgent } from "./base.js";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "./types.js";

class TestAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = {
    id: "test-agent",
    name: "Test Agent",
    version: "1.0.0",
    author: "test",
    description: "A test agent",
    category: "Research",
    capabilities: ["testing"],
    inputSchema: { task: "", subTask: "" },
    outputSchema: {
      success: true,
      data: {},
      summary: "",
      confidence: 0,
      executionTime: 0,
    },
    pricing: { perExecution: 0, currency: "USD" },
    tags: ["test"],
  };

  shouldFail = false;

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    if (this.shouldFail) throw new Error("Test failure");
    return {
      success: true,
      data: { result: "ok" },
      summary: `Processed: ${input.subTask}`,
      confidence: 0.9,
      executionTime: 0,
    };
  }
}

describe("PilaBaseAgent", () => {
  it("execute() wraps run() and adds execution time", async () => {
    const agent = new TestAgent();
    const result = await agent.execute({
      task: "test",
      subTask: "do something",
    });
    expect(result.success).toBe(true);
    expect(result.summary).toBe("Processed: do something");
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it("execute() catches errors from run() and returns failure", async () => {
    const agent = new TestAgent();
    agent.shouldFail = true;
    const result = await agent.execute({ task: "test", subTask: "will fail" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Test failure");
    expect(result.confidence).toBe(0);
  });

  it("validate() requires task and subTask", () => {
    const agent = new TestAgent();
    expect(agent.validate({ task: "a", subTask: "b" })).toBe(true);
    expect(agent.validate({ task: "", subTask: "b" })).toBe(false);
    expect(agent.validate({ task: "a", subTask: "" })).toBe(false);
  });

  it("healthCheck() returns true by default", async () => {
    const agent = new TestAgent();
    expect(await agent.healthCheck()).toBe(true);
  });

  describe("getApiKey()", () => {
    afterEach(() => {
      delete process.env.TEST_API_KEY;
    });

    it("returns constructor-injected key over process.env", () => {
      process.env.TEST_API_KEY = "from-env";
      const agent = new TestAgent({ apiKeys: { TEST_API_KEY: "from-config" } });
      // Access via execute path — use a helper subclass to expose getApiKey
      expect(
        (agent as unknown as { getApiKey: (k: string) => string }).getApiKey(
          "TEST_API_KEY",
        ),
      ).toBe("from-config");
    });

    it("falls back to process.env when key not in config", () => {
      process.env.TEST_API_KEY = "from-env";
      const agent = new TestAgent();
      expect(
        (agent as unknown as { getApiKey: (k: string) => string }).getApiKey(
          "TEST_API_KEY",
        ),
      ).toBe("from-env");
    });

    it("throws when key is in neither config nor process.env", () => {
      const agent = new TestAgent();
      expect(() =>
        (agent as unknown as { getApiKey: (k: string) => string }).getApiKey(
          "MISSING_KEY",
        ),
      ).toThrow("MISSING_KEY not set");
    });

    it("prefers constructor-injected key even when process.env has a different value", () => {
      process.env.TEST_API_KEY = "env-value";
      const agent = new TestAgent({
        apiKeys: { TEST_API_KEY: "injected-value" },
      });
      expect(
        (agent as unknown as { getApiKey: (k: string) => string }).getApiKey(
          "TEST_API_KEY",
        ),
      ).toBe("injected-value");
    });

    it("returns process.env value when config.apiKeys is undefined", () => {
      process.env.TEST_API_KEY = "env-only";
      const agent = new TestAgent({});
      expect(
        (agent as unknown as { getApiKey: (k: string) => string }).getApiKey(
          "TEST_API_KEY",
        ),
      ).toBe("env-only");
    });
  });

  describe("loadEnv()", () => {
    it("is a static method on PilaBaseAgent", () => {
      expect(
        typeof (PilaBaseAgent as unknown as { loadEnv: unknown }).loadEnv,
      ).toBe("function");
    });

    it("calls dotenv.config with the resolved path from import.meta.url", async () => {
      const dotenv = await import("dotenv");
      const spy = vi
        .spyOn(dotenv.default, "config")
        .mockImplementation(() => ({ parsed: {} }));

      // Use a file:// URL to simulate import.meta.url (must be absolute)
      (
        PilaBaseAgent as unknown as {
          loadEnv: (url: string, filename?: string) => void;
        }
      ).loadEnv("file:///C:/fake/agent/dir/index.js");

      expect(spy).toHaveBeenCalledTimes(1);
      const firstCall = spy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callArg = firstCall?.[0] as { path: string };
      expect(callArg.path).toContain("fake");
      expect(callArg.path).toMatch(/\.env$/);

      spy.mockRestore();
    });

    it("accepts a custom filename parameter", async () => {
      const dotenv = await import("dotenv");
      const spy = vi
        .spyOn(dotenv.default, "config")
        .mockImplementation(() => ({ parsed: {} }));

      (
        PilaBaseAgent as unknown as {
          loadEnv: (url: string, filename?: string) => void;
        }
      ).loadEnv("file:///C:/fake/agent/dir/index.js", ".env.local");

      const firstCall = spy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callArg = firstCall?.[0] as { path: string };
      expect(callArg.path).toMatch(/\.env\.local$/);

      spy.mockRestore();
    });
  });
});
