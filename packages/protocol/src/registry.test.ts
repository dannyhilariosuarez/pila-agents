import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerAgent } from "./registry.js";
import type {
  PilaAgent,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "./types.js";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createValidAgent(overrides?: Partial<PilaAgentManifest>): PilaAgent {
  const manifest: PilaAgentManifest = {
    id: "test-agent",
    name: "Test Agent",
    version: "1.0.0",
    author: "Test Author",
    description: "A test agent for unit testing",
    category: "Research",
    capabilities: ["search", "summarize"],
    inputSchema: { task: "test", subTask: "test" },
    outputSchema: {
      success: true,
      data: {},
      summary: "",
      confidence: 1,
      executionTime: 0,
    },
    pricing: { perExecution: 10, currency: "USD" },
    tags: ["test", "unit"],
    ...overrides,
  };

  return {
    manifest,
    execute: vi
      .fn<(input: PilaInputSchema) => Promise<PilaOutputSchema>>()
      .mockResolvedValue({
        success: true,
        data: {},
        summary: "done",
        confidence: 1,
        executionTime: 100,
      }),
    validate: vi
      .fn<(input: PilaInputSchema) => boolean>()
      .mockReturnValue(true),
    healthCheck: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };
}

const opts = { registryUrl: "https://registry.test", apiKey: "dev-key" };

describe("registerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PILA_REGISTRY_URL;
    delete process.env.PILA_API_KEY;
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(
      jsonResponse(
        { success: true, agentId: "new-uuid", name: "Test Agent" },
        201,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("manifest validation", () => {
    it("rejects agent with invalid id (uppercase, spaces)", async () => {
      const agent = createValidAgent({ id: "Invalid Agent ID" });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/id must be a lowercase slug/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects agent missing name", async () => {
      const agent = createValidAgent({ name: "" });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("name is required");
    });

    it("rejects agent with invalid version (not semver)", async () => {
      const agent = createValidAgent({ version: "v1" });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/version must be valid semver/);
    });

    it("rejects agent with empty capabilities", async () => {
      const agent = createValidAgent({ capabilities: [] });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("capabilities must not be empty");
    });

    it("rejects agent with empty tags", async () => {
      const agent = createValidAgent({ tags: [] });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("tags must not be empty");
    });

    it("rejects agent with negative pricing", async () => {
      const agent = createValidAgent({
        pricing: { perExecution: -5, currency: "USD" },
      });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("pricing.perExecution must be >= 0");
    });

    it("rejects agent with invalid category", async () => {
      const agent = createValidAgent({
        category: "NotACategory" as PilaAgentManifest["category"],
      });
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/category must be one of/);
    });
  });

  describe("health check", () => {
    it("rejects when health check fails", async () => {
      const agent = createValidAgent();
      (agent.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const result = await registerAgent(agent, opts);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Agent health check failed");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("registry configuration", () => {
    it("returns an error when no API key is available", async () => {
      const agent = createValidAgent();
      const result = await registerAgent(agent, {
        registryUrl: "https://registry.test",
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "An API key is required: pass options.apiKey or set PILA_API_KEY",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("reads the registry URL and API key from the environment", async () => {
      process.env.PILA_REGISTRY_URL = "https://env-registry.test";
      process.env.PILA_API_KEY = "env-key";
      const agent = createValidAgent();

      const result = await registerAgent(agent);

      expect(result.success).toBe(true);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://env-registry.test/developers/register");
      expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
        "env-key",
      );
    });
  });

  describe("HTTP registration", () => {
    it("posts the manifest to the registry with the API key", async () => {
      const agent = createValidAgent();

      const result = await registerAgent(agent, opts);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe("new-uuid");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://registry.test/developers/register");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers["X-API-Key"]).toBe("dev-key");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.manifest).toMatchObject({
        id: "test-agent",
        version: "1.0.0",
      });
      expect(body.category).toBe("Research");
    });

    it("never sends a Supabase service key", async () => {
      process.env.SUPABASE_SERVICE_KEY = "super-secret-service-key";
      const agent = createValidAgent();

      await registerAgent(agent, opts);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const serialised = JSON.stringify({
        headers: init.headers,
        body: init.body,
      });
      expect(serialised).not.toContain("super-secret-service-key");
      delete process.env.SUPABASE_SERVICE_KEY;
    });

    it("returns the agent id when the registry reports an update", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          success: true,
          agentId: "existing-uuid",
          updated: true,
        }),
      );
      const agent = createValidAgent();

      const result = await registerAgent(agent, opts);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe("existing-uuid");
    });

    it("surfaces a 401 from the registry as an auth error", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Invalid API key" }, 401),
      );
      const agent = createValidAgent();

      const result = await registerAgent(agent, opts);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/Invalid API key/);
    });

    it("surfaces a server error response", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Registration failed" }, 500),
      );
      const agent = createValidAgent();

      const result = await registerAgent(agent, opts);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/Registration failed/);
    });

    it("returns an error when the registry is unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      const agent = createValidAgent();

      const result = await registerAgent(agent, opts);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatch(/ECONNREFUSED/);
    });
  });
});
