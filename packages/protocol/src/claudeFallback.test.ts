import { describe, it, expect, vi } from "vitest";
import { ClaudeFallbackAgent } from "./claudeFallback.js";
import type { ContentBlock } from "./claudeFallback.js";
import type { PilaAgentManifest } from "./types.js";

vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const sampleManifest: PilaAgentManifest = {
  id: "test-agent",
  name: "Test Agent",
  version: "1.0.0",
  author: "test",
  description: "A test agent",
  category: "Research",
  capabilities: ["search", "analyze"],
  pricing: { perExecution: 0.01, currency: "USD" },
  tags: ["test"],
  inputSchema: { task: "", subTask: "" },
  outputSchema: {
    success: true,
    data: {},
    summary: "",
    confidence: 0,
    executionTime: 0,
  },
};

function makeClient(
  createFn: (...args: unknown[]) => Promise<{ content: ContentBlock[] }>,
) {
  return { messages: { create: vi.fn(createFn) } };
}

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolUseResponse(
  id: string,
  name: string,
  input: unknown,
  text?: string,
) {
  const content: ContentBlock[] = [
    { type: "tool_use", id, name, input } as ContentBlock,
  ];
  if (text) content.unshift({ type: "text", text } as ContentBlock);
  return { content };
}

describe("ClaudeFallbackAgent", () => {
  const input = { task: "Find flights", subTask: "Search LAX to JFK" };

  describe("valid JSON response", () => {
    it("returns parsed JSON when Claude returns well-formed JSON", async () => {
      const json = JSON.stringify({
        summary: "Found 3 flights from LAX to JFK",
        data: { flights: 3 },
        confidence: 0.85,
        sources: ["airline-api"],
      });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.success).toBe(true);
      expect(result.summary).toBe("Found 3 flights from LAX to JFK");
      expect(result.data).toEqual({ flights: 3 });
      expect(result.confidence).toBe(0.85);
      expect(result.sources).toEqual(["airline-api"]);
      expect(result.executionTime).toBe(0);
    });

    it("extracts JSON wrapped in markdown code fences", async () => {
      const text =
        '```json\n{"summary":"result","data":{"x":1},"confidence":0.9,"sources":[]}\n```';
      const client = makeClient(async () => textResponse(text));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.summary).toBe("result");
      expect(result.data).toEqual({ x: 1 });
      expect(result.confidence).toBe(0.9);
    });

    it("uses confidence from Claude's JSON when it is a number", async () => {
      const json = JSON.stringify({ summary: "ok", confidence: 0.42 });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.confidence).toBe(0.42);
    });

    it("defaults confidence to 0.6 when confidence field is missing", async () => {
      const json = JSON.stringify({ summary: "ok", data: {} });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.confidence).toBe(0.6);
    });

    it("defaults data to {} when data field is missing", async () => {
      const json = JSON.stringify({ summary: "ok", confidence: 0.7 });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.data).toEqual({});
    });

    it("defaults sources to [] when sources is not an array", async () => {
      const json = JSON.stringify({ summary: "ok", sources: "not-an-array" });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.sources).toEqual([]);
    });

    it("uses raw text as summary when parsed summary is missing", async () => {
      const json = JSON.stringify({ data: { key: "val" }, confidence: 0.8 });
      const client = makeClient(async () => textResponse(json));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.summary).toBe(json.trim());
    });
  });

  describe("no braces in response (raw text fallback)", () => {
    it("returns raw text as summary with confidence 0.5 when no JSON braces found", async () => {
      const client = makeClient(async () =>
        textResponse("Just a plain text answer with no braces"),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.success).toBe(true);
      expect(result.summary).toBe("Just a plain text answer with no braces");
      expect(result.confidence).toBe(0.5);
      expect(result.data).toEqual({});
      expect(result.sources).toEqual([]);
    });
  });

  describe("malformed JSON fallback", () => {
    it("returns fallback with confidence 0.5 when JSON parsing fails", async () => {
      const malformed = '{"summary": "broken", "data": {bad json here}';
      const client = makeClient(async () => textResponse(malformed));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.success).toBe(true);
      expect(result.summary).toBe(malformed.trim());
      expect(result.confidence).toBe(0.5);
      expect(result.data).toEqual({});
      expect(result.sources).toEqual([]);
    });
  });

  describe("empty response", () => {
    it("treats empty string as {} and returns fallback", async () => {
      const client = makeClient(async () => textResponse(""));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      // empty raw becomes "{}" -> parsed as empty object
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it("treats response with no text blocks as empty", async () => {
      const client = makeClient(async () => ({ content: [] }));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.success).toBe(true);
    });
  });

  describe("tool use - web_search", () => {
    it("calls searchFn when Claude requests web_search", async () => {
      const searchFn = vi.fn().mockResolvedValue("Flight results from web");
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("tool-1", "web_search", {
              query: "LAX to JFK flights",
            }),
          )
          .mockResolvedValueOnce(
            textResponse(
              '{"summary":"Found flights","data":{},"confidence":0.8}',
            ),
          ),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      const result = await agent.run(input);

      expect(searchFn).toHaveBeenCalledWith("LAX to JFK flights");
      expect(result.summary).toBe("Found flights");
      expect(client.messages.create).toHaveBeenCalledTimes(2);
    });

    it("passes tool results back to Claude as user message", async () => {
      const searchFn = vi.fn().mockResolvedValue("search result data");
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("t1", "web_search", { query: "test" }),
          )
          .mockResolvedValueOnce(
            textResponse('{"summary":"done","confidence":0.7}'),
          ),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      // The second call should include the tool result in messages
      const secondCall = client.messages.create.mock.calls[1];
      expect(secondCall).toBeDefined();
      const secondCallArgs = secondCall?.[0] as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const messages = secondCallArgs.messages;
      // Should have: original user message, assistant tool_use, user tool_result
      expect(messages).toHaveLength(3);
      const toolResultMsg = messages[2];
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg?.role).toBe("user");
      expect(toolResultMsg?.content).toEqual([
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: "search result data",
        },
      ]);
    });

    it("handles multiple tool rounds up to MAX_TOOL_ROUNDS", async () => {
      const searchFn = vi.fn().mockResolvedValue("result");
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("t1", "web_search", { query: "q1" }),
          )
          .mockResolvedValueOnce(
            toolUseResponse("t2", "web_search", { query: "q2" }),
          )
          .mockResolvedValueOnce(
            toolUseResponse("t3", "web_search", { query: "q3" }),
          )
          // Round 3 is the last (0,1,2,3 = 4 iterations with <= MAX_TOOL_ROUNDS check)
          .mockResolvedValueOnce(
            textResponse('{"summary":"final","confidence":0.9}'),
          ),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      const result = await agent.run(input);

      expect(searchFn).toHaveBeenCalledTimes(3);
      expect(client.messages.create).toHaveBeenCalledTimes(4);
      expect(result.summary).toBe("final");
    });

    it("stops after MAX_TOOL_ROUNDS even if Claude keeps requesting tools", async () => {
      const searchFn = vi.fn().mockResolvedValue("result");
      // All responses request tool use - should stop after 4 calls (rounds 0-3)
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValue(
            toolUseResponse("t1", "web_search", { query: "q" }, "partial text"),
          ),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      // round 0,1,2,3 = 4 calls total (loop condition: round <= MAX_TOOL_ROUNDS)
      expect(client.messages.create).toHaveBeenCalledTimes(4);
    });

    it("handles search function errors gracefully", async () => {
      const searchFn = vi.fn().mockRejectedValue(new Error("Network timeout"));
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("t1", "web_search", { query: "test" }),
          )
          .mockResolvedValueOnce(
            textResponse('{"summary":"handled error","confidence":0.5}'),
          ),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      const result = await agent.run(input);

      // Verify error was passed as tool result
      const secondCall = client.messages.create.mock.calls[1];
      expect(secondCall).toBeDefined();
      const secondCallArgs = secondCall?.[0] as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const msg = secondCallArgs.messages[2];
      expect(msg).toBeDefined();
      const toolResult = (
        msg?.content as Array<{ content: string }> | undefined
      )?.[0];
      expect(toolResult).toBeDefined();
      expect(toolResult?.content).toBe("Search failed: Network timeout");
      expect(result.summary).toBe("handled error");
    });

    it("handles non-Error thrown values in searchFn", async () => {
      const searchFn = vi.fn().mockRejectedValue("string error");
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("t1", "web_search", { query: "test" }),
          )
          .mockResolvedValueOnce(textResponse('{"summary":"ok"}')),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      const secondCallArgs = (
        client.messages.create.mock.calls[1] as unknown[]
      )?.[0] as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const toolResult = (
        secondCallArgs.messages[2]?.content as
          | Array<{ content: string }>
          | undefined
      )?.[0];
      expect(toolResult?.content).toBe("Search failed: string error");
    });

    it("returns 'Unknown tool' for unrecognized tool names", async () => {
      const searchFn = vi.fn();
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(
            toolUseResponse("t1", "calculator", { expression: "2+2" }),
          )
          .mockResolvedValueOnce(textResponse('{"summary":"done"}')),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      expect(searchFn).not.toHaveBeenCalled();
      const secondCallArgs = (
        client.messages.create.mock.calls[1] as unknown[]
      )?.[0] as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const toolResult = (
        secondCallArgs.messages[2]?.content as
          | Array<{ content: string }>
          | undefined
      )?.[0];
      expect(toolResult?.content).toBe("Unknown tool: calculator");
    });

    it("handles missing query in web_search input", async () => {
      const searchFn = vi.fn().mockResolvedValue("empty query result");
      const client = makeClient(
        vi
          .fn()
          .mockResolvedValueOnce(toolUseResponse("t1", "web_search", {}))
          .mockResolvedValueOnce(textResponse('{"summary":"ok"}')),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      // Should call searchFn with empty string when query is missing
      expect(searchFn).toHaveBeenCalledWith("");
    });
  });

  describe("tools parameter", () => {
    it("does not pass tools when no searchFn is provided", async () => {
      const client = makeClient(async () =>
        textResponse('{"summary":"no tools"}'),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { tools?: unknown };
      expect(callArgs.tools).toBeUndefined();
    });

    it("passes web_search tool when searchFn is provided", async () => {
      const searchFn = vi.fn();
      const client = makeClient(async () =>
        textResponse('{"summary":"with tools"}'),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client, searchFn);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { tools?: unknown[] };
      expect(callArgs.tools).toHaveLength(1);
      expect((callArgs.tools?.[0] as { name: string } | undefined)?.name).toBe(
        "web_search",
      );
    });

    it("breaks out of loop when tool_use blocks exist but no searchFn", async () => {
      // Edge case: Claude returns tool_use but agent has no searchFn
      const client = makeClient(async () =>
        toolUseResponse("t1", "web_search", { query: "test" }, "some text"),
      );
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      // Should only call once (breaks because no searchFn)
      expect(client.messages.create).toHaveBeenCalledTimes(1);
      expect(result.summary).toBe("some text");
    });
  });

  describe("system prompt construction", () => {
    it("includes manifest name and capabilities in system prompt", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { system: string };
      expect(callArgs.system).toContain("Test Agent");
      expect(callArgs.system).toContain("search, analyze");
      expect(callArgs.system).toContain("A test agent");
    });

    it("includes task and subTask in system prompt", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { system: string };
      expect(callArgs.system).toContain("Find flights");
      expect(callArgs.system).toContain("Search LAX to JFK");
    });

    it("includes context in system prompt when provided", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run({
        task: "test",
        subTask: "sub",
        context: "Previous agent found 5 options",
      });

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { system: string };
      expect(callArgs.system).toContain("Prior results from upstream agents");
      expect(callArgs.system).toContain("Previous agent found 5 options");
    });

    it("does not include context section when context is not provided", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run({ task: "test", subTask: "sub" });

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { system: string };
      expect(callArgs.system).not.toContain(
        "Prior results from upstream agents",
      );
    });
  });

  describe("user message construction", () => {
    it("includes task and subTask in the user message", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(callArgs.messages[0]?.content).toContain("Find flights");
      expect(callArgs.messages[0]?.content).toContain("Search LAX to JFK");
    });
  });

  describe("model configuration", () => {
    it("uses claude-sonnet-4-20250514 model", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { model: string };
      expect(callArgs.model).toBe("claude-sonnet-4-20250514");
    });

    it("sets max_tokens to 1024", async () => {
      const client = makeClient(async () => textResponse('{"summary":"ok"}'));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      await agent.run(input);

      const callArgs = (
        client.messages.create.mock.calls[0] as unknown[]
      )?.[0] as { max_tokens: number };
      expect(callArgs.max_tokens).toBe(1024);
    });
  });

  describe("manifest exposure", () => {
    it("exposes manifest as a public property", () => {
      const client = makeClient(async () => textResponse(""));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      expect(agent.manifest).toBe(sampleManifest);
    });
  });

  describe("multiple text blocks", () => {
    it("concatenates multiple text blocks into raw output", async () => {
      const client = makeClient(async () => ({
        content: [
          { type: "text", text: '{"summary":' },
          { type: "text", text: '"combined","confidence":0.75}' },
        ],
      }));
      const agent = new ClaudeFallbackAgent(sampleManifest, client);

      const result = await agent.run(input);

      expect(result.summary).toBe("combined");
      expect(result.confidence).toBe(0.75);
    });
  });
});
