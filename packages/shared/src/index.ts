/**
 * @module shared - Core types, constants, and interfaces shared across all Pila packages.
 */

// -- Constants --

/** Maximum time (ms) to wait for a single agent execution before timing out. Default: 30s. */
export const AGENT_TIMEOUT_MS = 30_000;

/** Maximum number of agents that can execute concurrently within a single task. */
export const MAX_CONCURRENT_AGENTS = 2;

/** Maximum retry attempts for task decomposition before giving up. */
export const DECOMPOSE_MAX_RETRIES = 3;

/** Lifecycle states for a task (Run). */
export const TaskStatus = {
  Pending: "pending",
  Processing: "processing",
  Running: "running",
  Complete: "complete",
  Failed: "failed",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Lifecycle states for a task_agent assignment. */
export const AgentStatus = {
  Hired: "hired",
  Running: "running",
  Complete: "complete",
  Failed: "failed",
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

/** A pila user account (Slack or anonymous web session). */
export interface User {
  id: string;
  slack_user_id: string;
  slack_team_id: string;
  name: string;
  created_at: string;
}

/** Agent specialization category for routing and filtering. */
export type AgentCategory =
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

/** A registered agent in the pila registry. */
export interface Agent {
  id: string;
  name: string;
  category: AgentCategory;
  description: string;
  manifest: AgentManifest;
  price_per_task: number;
  success_rate: number;
}

/** A task (Run) created by a user. */
export interface Task {
  id: string;
  user_id: string;
  input: string;
  status: TaskStatus;
  result: unknown;
  created_at: string;
}

/** A join record linking a task to an assigned agent. */
export interface TaskAgent {
  id: string;
  task_id: string;
  agent_id: string;
  status: AgentStatus;
  output: unknown;
  started_at: string | null;
  completed_at: string | null;
}

/** A scheduled monitor (Watch) that runs tasks on a cron schedule. */
export interface Heartbeat {
  id: string;
  user_id: string;
  name: string;
  task: string;
  schedule: string;
  is_active: boolean;
  slack_channel_id: string | null;
  slack_team_id: string | null;
  human_schedule: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result: string | null;
}

/** A Slack OAuth installation record. */
export interface Installation {
  id: string;
  team_id: string;
  enterprise_id: string | null;
  installation_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A record of a single agent execution with outcome and latency. */
export interface AgentExecution {
  id: string;
  agent_id: string;
  task_agent_id: string;
  success: boolean;
  latency_ms: number;
  schema_valid: boolean;
  created_at: string;
}

// -- Agent manifest --

/** Declarative agent configuration embedded in the agents table JSONB column. */
export interface AgentManifest {
  name: string;
  version: string;
  category: AgentCategory;
  description?: string;
  capabilities?: string[];
  tags?: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export * from "./billing.js";
export * from "./versioning.js";
export * from "./brandedTypes.js";
