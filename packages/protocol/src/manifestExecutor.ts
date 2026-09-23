/**
 * ManifestExecutor — executes a Tap by reasoning about its declared tools.
 *
 * A Tap declares tools in plain English. ManifestExecutor uses Claude to:
 *   1. Decide which tools to invoke and in what order
 *   2. For tools with a URL → make the HTTP call
 *   3. For tools without a URL → produce the result through reasoning
 *   4. Synthesize all tool outputs into a structured response
 *
 * The developer hosts nothing. They just describe what each tool does.
 * Claude figures out how to execute it.
 *
 * Never throws — always returns a PilaOutputSchema.
 */

import { PilaBaseAgent } from "./base.js";
import type {
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "./types.js";
import type { AnthropicClient, ContentBlock } from "./claudeFallback.js";
import type { TapJson, TapTool } from "./tapSchema.js";

const MAX_RETRIES = 2;
const FETCH_TIMEOUT_MS = 15_000;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/** Result of executing a single tool. */
interface ToolResult {
  tool: string;
  output: string;
  source: "api" | "reasoning";
}

/** A PilaAgent that executes a Tap's declared tools via Claude reasoning. */
export class ManifestExecutor extends PilaBaseAgent {
  manifest: PilaAgentManifest;
  private client: AnthropicClient;
  private tap: TapJson;
  private apiKey?: string;

  constructor(
    manifest: PilaAgentManifest,
    client: AnthropicClient,
    tap: TapJson,
    apiKey?: string,
  ) {
    super();
    this.manifest = manifest;
    this.client = client;
    this.tap = tap;
    this.apiKey = apiKey;
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    try {
      // If the tap has no tools (e.g. manifest missing tools array),
      // skip the plan-execute loop and go straight to Claude reasoning.
      if (this.tap.tools.length === 0) {
        return await this.directReasoning(input);
      }

      // Step 1: Ask Claude which tools to use and how
      const plan = await this.planExecution(input);

      // Step 2: Execute each planned tool
      const toolResults: ToolResult[] = [];
      for (const step of plan) {
        // Fuzzy match: normalize both names to lowercase with hyphens stripped
        const normalize = (s: string) =>
          s.toLowerCase().replace(/[-_\s]+/g, "");
        const tool = this.tap.tools.find(
          (t) =>
            t.name === step.toolName ||
            normalize(t.name) === normalize(step.toolName),
        );
        if (!tool) continue;

        const result = tool.url
          ? await this.executeApiTool(tool, step.parameters, toolResults)
          : await this.executeReasoningTool(
              tool,
              input,
              step.parameters,
              toolResults,
            );

        toolResults.push(result);
      }

      // If the plan matched no tools (e.g. name mismatch), fall back to direct reasoning
      if (toolResults.length === 0) {
        return await this.directReasoning(input);
      }

      // Step 3: Synthesize all tool outputs into a structured response
      return await this.synthesize(input, toolResults);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        data: {},
        summary: `Tap execution failed: ${msg}`,
        confidence: 0,
        sources: [],
        executionTime: 0,
        error: msg,
      };
    }
  }

  /**
   * Ask Claude to plan which tools to invoke and with what parameters.
   * Returns an ordered list of tool invocations.
   */
  private async planExecution(
    input: PilaInputSchema,
  ): Promise<Array<{ toolName: string; parameters: Record<string, unknown> }>> {
    const toolDescriptions = this.tap.tools
      .map((t) => {
        const parts = [`- "${t.name}": ${t.description}`];
        if (t.url) parts.push(`  [API: ${t.method ?? "POST"} ${t.url}]`);
        if (t.bodyTemplate)
          parts.push(`  [Body template: ${JSON.stringify(t.bodyTemplate)}]`);
        return parts.join("\n");
      })
      .join("\n");

    const message = await this.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: `You are a tool execution planner. Given a task and available tools, decide which tools to invoke and in what order.

Available tools:
${toolDescriptions}

Return ONLY a JSON array of tool invocations:
[{ "toolName": "tool-name", "parameters": { "key": "value" } }]

CRITICAL: You MUST use at least one tool. Every tool listed above is relevant — invoke all tools that help complete the task.
Read each tool's description carefully for required query/body parameters and include ALL of them.
For API tools (GET/POST), parameters become query params (GET) or JSON body (POST).
If a description says "pass X, Y, and Z" — include X, Y, and Z as parameter keys.
If a tool has a body template, fill in the template values as parameters.
Use your knowledge to resolve locations to coordinates, names to IDs, etc.
Order matters — later tools can use results from earlier ones.`,
      messages: [
        {
          role: "user",
          content: `Task: ${input.subTask}\nOriginal request: ${input.task}${input.context ? `\nUpstream context: ${input.context}` : ""}`,
        },
      ],
    });

    const text = this.extractText(message.content as ContentBlock[]);
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Find the array
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) {
      // No plan — execute all tools in order
      return this.tap.tools.map((t) => ({ toolName: t.name, parameters: {} }));
    }

    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(parsed)) {
        return this.tap.tools.map((t) => ({
          toolName: t.name,
          parameters: {},
        }));
      }
      // If Claude returned an empty plan but we have tools, execute all of them
      if (parsed.length === 0 && this.tap.tools.length > 0) {
        return this.tap.tools.map((t) => ({
          toolName: t.name,
          parameters: {},
        }));
      }
      return parsed as Array<{
        toolName: string;
        parameters: Record<string, unknown>;
      }>;
    } catch {
      return this.tap.tools.map((t) => ({ toolName: t.name, parameters: {} }));
    }
  }

  /**
   * Execute a tool that has a URL — make the HTTP call.
   */
  private async executeApiTool(
    tool: TapTool,
    parameters: Record<string, unknown>,
    priorResults: ToolResult[],
  ): Promise<ToolResult> {
    let url = tool.url as string;
    const method = tool.method ?? "POST";
    const headers: Record<string, string> = {
      ...(tool.headers ?? {}),
    };

    // Inject API key if provided
    if (this.apiKey && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Build request — GET params go on the URL, POST params go in the body
    let body: string | undefined;
    if (method === "GET") {
      const merged = tool.bodyTemplate
        ? this.fillTemplate(tool.bodyTemplate, parameters, priorResults)
        : parameters;
      // Build query string manually — URLSearchParams encodes commas as %2C
      // which breaks APIs that expect literal commas (e.g. Open-Meteo's
      // `current=temperature_2m,wind_speed_10m` parameter).
      const pairs: string[] = [];
      for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined && value !== null) {
          pairs.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value)).replace(/%2C/gi, ",")}`,
          );
        }
      }
      const qs = pairs.join("&");
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    } else {
      headers["Content-Type"] = "application/json";
      const bodyData = tool.bodyTemplate
        ? this.fillTemplate(tool.bodyTemplate, parameters, priorResults)
        : parameters;
      body = JSON.stringify(bodyData);
    }

    try {
      const responseText = await this.fetchWithRetry(
        url,
        method,
        headers,
        body,
      );

      // Extract via resultPath if specified
      let extracted = responseText;
      if (tool.resultPath) {
        extracted =
          this.extractPath(responseText, tool.resultPath) ?? responseText;
      }

      return { tool: tool.name, output: extracted, source: "api" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        tool: tool.name,
        output: `API call failed: ${msg}`,
        source: "api",
      };
    }
  }

  /**
   * Execute a tool that has no URL — Claude reasons the result.
   * This is where the magic is: the developer describes the tool in English,
   * Claude produces the output through pure reasoning.
   */
  private async executeReasoningTool(
    tool: TapTool,
    input: PilaInputSchema,
    parameters: Record<string, unknown>,
    priorResults: ToolResult[],
  ): Promise<ToolResult> {
    const priorContext =
      priorResults.length > 0
        ? `\n\nResults from prior tools:\n${priorResults.map((r) => `[${r.tool}]: ${r.output}`).join("\n")}`
        : "";

    const message = await this.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: `You are executing a tool called "${tool.name}".

Tool description: ${tool.description}

You must produce the tool's output based on the task and any parameters provided. Be precise and specific. Return only the result — no preamble.${priorContext}`,
      messages: [
        {
          role: "user",
          content: `Task: ${input.subTask}\nParameters: ${JSON.stringify(parameters)}`,
        },
      ],
    });

    const text = this.extractText(message.content as ContentBlock[]);
    return { tool: tool.name, output: text, source: "reasoning" };
  }

  /**
   * Synthesize all tool outputs into a final structured PilaOutputSchema.
   */
  private async synthesize(
    input: PilaInputSchema,
    toolResults: ToolResult[],
  ): Promise<PilaOutputSchema> {
    // Safety net — should not reach here with empty results since run()
    // redirects to directReasoning, but handle gracefully just in case.
    if (toolResults.length === 0) {
      return await this.directReasoning(input);
    }

    const toolOutputs = toolResults
      .map((r) => `[${r.tool} (${r.source})]: ${r.output}`)
      .join("\n\n");

    const sources = toolResults
      .map((r) => {
        const tool = this.tap.tools.find((t) => t.name === r.tool);
        return tool?.url;
      })
      .filter((u): u is string => !!u);

    const message = await this.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: `Synthesize tool outputs into a structured response. Return ONLY valid JSON:
{
  "summary": "3-4 sentence summary answering the original task",
  "data": { "structured key findings" }
}`,
      messages: [
        {
          role: "user",
          content: `Task: ${input.subTask}\n\nTool outputs:\n${toolOutputs}`,
        },
      ],
    });

    const text = this.extractText(message.content as ContentBlock[]);
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1) {
      return {
        success: true,
        data: {
          toolResults: toolResults.map((r) => ({
            tool: r.tool,
            output: r.output,
          })),
        },
        summary: toolResults.map((r) => r.output).join(" "),
        confidence: 1.0,
        sources,
        executionTime: 0,
      };
    }

    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        summary?: string;
        data?: Record<string, unknown>;
      };

      return {
        success: true,
        data: parsed.data ?? {
          toolResults: toolResults.map((r) => ({
            tool: r.tool,
            output: r.output,
          })),
        },
        summary: parsed.summary ?? toolResults.map((r) => r.output).join(" "),
        confidence: 1.0,
        sources,
        executionTime: 0,
      };
    } catch {
      return {
        success: true,
        data: {
          toolResults: toolResults.map((r) => ({
            tool: r.tool,
            output: r.output,
          })),
        },
        summary: toolResults.map((r) => r.output).join(" "),
        confidence: 1.0,
        sources,
        executionTime: 0,
      };
    }
  }

  /**
   * Fallback when no tools are available or none matched — Claude answers
   * the sub-task directly using the tap's description as persona context.
   */
  private async directReasoning(
    input: PilaInputSchema,
  ): Promise<PilaOutputSchema> {
    const message = await this.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: `You are "${this.tap.name}": ${this.tap.description}

Answer the user's task directly. Be specific and detailed. Return a structured response.${input.context ? `\n\nUpstream context:\n${input.context}` : ""}`,
      messages: [
        {
          role: "user",
          content: `Task: ${input.subTask}\nOriginal request: ${input.task}`,
        },
      ],
    });

    const text = this.extractText(message.content as ContentBlock[]);
    return {
      success: true,
      data: { result: text },
      summary: text,
      confidence: 0.8,
      sources: [],
      executionTime: 0,
    };
  }

  /** Fill a body template with parameters and prior tool results. */
  private fillTemplate(
    template: Record<string, unknown>,
    parameters: Record<string, unknown>,
    priorResults: ToolResult[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      if (
        typeof value === "string" &&
        value.startsWith("{{") &&
        value.endsWith("}}")
      ) {
        const ref = value.slice(2, -2).trim();
        if (ref in parameters) {
          result[key] = parameters[ref];
        } else if (ref === "task") {
          result[key] = parameters.task ?? "";
        } else {
          // Check if it references a prior tool result
          const priorResult = priorResults.find((r) => r.tool === ref);
          result[key] = priorResult?.output ?? value;
        }
      } else {
        result[key] = value;
      }
    }
    // Merge in any extra parameters not in the template
    for (const [key, value] of Object.entries(parameters)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }
    return result;
  }

  /** Extract a value from JSON response using dot-notation path. */
  private extractPath(responseText: string, path: string): string | null {
    try {
      const parsed = JSON.parse(responseText);
      const parts = path.split(".");
      let current: unknown = parsed;
      for (const part of parts) {
        if (current && typeof current === "object") {
          current = (current as Record<string, unknown>)[part];
        } else {
          return null;
        }
      }
      if (current === undefined) return null;
      return typeof current === "string" ? current : JSON.stringify(current);
    } catch {
      return null;
    }
  }

  /** Extract text content from Claude API content blocks. */
  private extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  /** Fetch a URL with retry logic. */
  private async fetchWithRetry(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(url, {
          method,
          headers,
          body: method !== "GET" ? body : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("Fetch failed");
  }
}
