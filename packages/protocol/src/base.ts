/**
 * Base agent class providing execution timing, structured error handling,
 * and environment configuration for all Pila agent implementations.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type {
  AgentConfig,
  PilaAgent,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "./types.js";

/** Abstract base class providing execution timing, error handling, and logging. */
export abstract class PilaBaseAgent implements PilaAgent {
  abstract manifest: PilaAgentManifest;
  protected config: AgentConfig;

  constructor(config?: AgentConfig) {
    this.config = config ?? {};
  }

  /** Load a `.env` file relative to the calling module's directory. */
  protected static loadEnv(importMetaUrl: string, filename = ".env"): void {
    const moduleDir = dirname(fileURLToPath(importMetaUrl));
    dotenv.config({ path: resolve(moduleDir, filename) });
  }

  /** Retrieve an API key. Priority: constructor-injected > process.env. Throws if missing. */
  protected getApiKey(name: string): string {
    const key = this.config.apiKeys?.[name] ?? process.env[name];
    if (!key) {
      throw new Error(`${name} not set`);
    }
    return key;
  }

  /** Implement this method with agent-specific logic. Called by `execute()`. */
  abstract run(input: PilaInputSchema): Promise<PilaOutputSchema>;

  /** Run the agent with timing, error handling, and structured output. */
  async execute(input: PilaInputSchema): Promise<PilaOutputSchema> {
    const start = Date.now();
    this.log(`Executing: ${input.subTask}`);

    try {
      const result = await this.run(input);
      result.executionTime = Date.now() - start;
      this.log(
        `Completed in ${result.executionTime}ms (confidence: ${result.confidence})`,
      );
      return result;
    } catch (err) {
      const executionTime = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Failed after ${executionTime}ms: ${message}`);
      return {
        success: false,
        data: {},
        summary: "",
        confidence: 0,
        executionTime,
        error: message,
      };
    }
  }

  /** Return true if the input has the required task and subTask fields. */
  validate(input: PilaInputSchema): boolean {
    return Boolean(input.task && input.subTask);
  }

  /** Default health check that always returns true. Override for custom checks. */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  protected log(message: string): void {
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        agent: this.manifest.name,
        message,
      }) + "\n",
    );
  }
}
