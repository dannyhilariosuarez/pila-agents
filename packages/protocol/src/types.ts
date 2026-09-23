/** Allowed agent categories for the pila registry. */
export type PilaCategory =
  | "Research"
  | "Finance"
  | "Legal"
  | "Media"
  | "Marketing"
  | "Operations"
  | "Technical"
  | "Communications"
  | "Travel"
  | "RealEstate";

/** Input passed to every agent execution. */
export interface PilaInputSchema {
  task: string;
  subTask: string;
  context?: string;
  parameters?: Record<string, unknown>;
}

/** Structured output returned by every agent, regardless of execution path. */
export interface PilaOutputSchema {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
  confidence: number;
  sources?: string[];
  executionTime: number;
  error?: string;
}

/** Per-execution pricing metadata for marketplace billing. */
export interface PilaPricing {
  perExecution: number;
  currency: string;
}

/** Self-describing metadata block used for discovery, scoring, and routing. */
export interface PilaAgentManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: PilaCategory;
  capabilities: string[];
  inputSchema: PilaInputSchema;
  outputSchema: PilaOutputSchema;
  pricing: PilaPricing;
  tags: string[];
}

/** Configuration passed to agents at construction time. */
export interface AgentConfig {
  apiKeys?: Record<string, string>;
}

/** The core agent contract. Every agent in pila implements this interface. */
export interface PilaAgent {
  manifest: PilaAgentManifest;
  execute(input: PilaInputSchema): Promise<PilaOutputSchema>;
  validate(input: PilaInputSchema): boolean;
  healthCheck(): Promise<boolean>;
}
