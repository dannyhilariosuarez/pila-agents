/**
 * Claude fallback agent — a generic agent implementation that delegates
 * execution to the Anthropic Claude API when no specialized executor exists.
 */

import { PilaBaseAgent } from "./base.js";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "./types.js";

/** Content block types returned by the Anthropic messages API. */
interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** Union of text and tool-use content blocks from the Anthropic API. */
export type ContentBlock = TextBlock | ToolUseBlock;

/** Tool definition for the Anthropic messages API. */
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Minimal interface for the Anthropic messages API client. */
export interface AnthropicClient {
  messages: {
    create(...args: unknown[]): Promise<{ content: ContentBlock[] }>;
  };
}

const WEB_SEARCH_TOOL: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for current, real-time information. Use this when you need live data like prices, news, weather, scores, or any information that changes over time.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
    },
    required: ["query"],
  },
};

const MAX_TOOL_ROUNDS = 3;

/** Fallback agent that uses Claude to execute tasks when no real executor exists. */
export class ClaudeFallbackAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest;
  private client: AnthropicClient;
  private searchFn?: (query: string) => Promise<string>;

  constructor(
    manifest: PilaAgentManifest,
    client:
      | AnthropicClient
      | {
          messages: {
            create: (
              ...args: unknown[]
            ) => Promise<{ content: ContentBlock[] }>;
          };
        },
    searchFn?: (query: string) => Promise<string>,
  ) {
    super();
    this.manifest = manifest;
    this.client = client as AnthropicClient;
    this.searchFn = searchFn;
  }

  /** Execute a sub-task using Claude with optional web search tool use. */
  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    const systemPrompt = `You are "${this.manifest.name}", a specialist agent.

Description: ${this.manifest.description}
Capabilities: ${this.manifest.capabilities.join(", ")}

The user's original request is: "${input.task}"
Your specific assignment is: "${input.subTask}"

Execute your assignment directly. Be specific — use the exact details from the original request.${input.context ? `\n\nPrior results from upstream agents:\n${input.context}` : ""}

Return ONLY valid JSON in this exact format:
{
  "summary": "A detailed 3-4 sentence result with concrete specifics",
  "data": { "key findings or structured results here" },
  "confidence": 0.7,
  "sources": ["source1", "source2"]
}

The confidence should reflect how well you could address the task:
- 0.8-1.0: Task is squarely within your specialty and you have high confidence
- 0.5-0.7: Task is related to your specialty but answer may be approximate
- 0.3-0.4: Task is tangential to your specialty`;

    const tools = this.searchFn ? [WEB_SEARCH_TOOL] : undefined;
    const messages: Array<{
      role: "user" | "assistant";
      content:
        | string
        | ContentBlock[]
        | Array<{ type: "tool_result"; tool_use_id: string; content: string }>;
    }> = [
      {
        role: "user",
        content: `Original request: ${input.task}\n\nYour assignment: ${input.subTask}`,
      },
    ];

    let raw = "";

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const message = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages,
      });

      // Collect any text from this response
      const blocks = message.content as ContentBlock[];
      const textBlocks = blocks.filter(
        (b: ContentBlock): b is TextBlock => b.type === "text",
      );
      if (textBlocks.length > 0) {
        raw = textBlocks.map((b: TextBlock) => b.text).join("");
      }

      // If no tool use or no search function, we're done
      const toolUseBlocks = blocks.filter(
        (b: ContentBlock): b is ToolUseBlock => b.type === "tool_use",
      );
      if (toolUseBlocks.length === 0 || !this.searchFn) {
        break;
      }

      // Process tool calls
      messages.push({ role: "assistant", content: message.content });

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];
      for (const toolUse of toolUseBlocks) {
        if (toolUse.name === "web_search") {
          const query = (toolUse.input as { query?: string }).query ?? "";
          this.log(`[ClaudeFallbackAgent] web_search: "${query}"`);
          try {
            const result = await this.searchFn(query);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `Search failed: ${errMsg}`,
            });
          }
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Unknown tool: ${toolUse.name}`,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (!raw) raw = "{}";
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1) {
      return {
        success: true,
        data: {},
        summary: raw.trim(),
        confidence: 0.5,
        sources: [],
        executionTime: 0,
      };
    }

    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        summary?: string;
        data?: Record<string, unknown>;
        confidence?: number;
        sources?: string[];
      };

      return {
        success: true,
        data: parsed.data ?? {},
        summary: parsed.summary ?? raw.trim(),
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        executionTime: 0,
      };
    } catch {
      return {
        success: true,
        data: {},
        summary: raw.trim(),
        confidence: 0.5,
        sources: [],
        executionTime: 0,
      };
    }
  }
}
