import { describe, it, expect } from "vitest";
import {
  AGENT_TIMEOUT_MS,
  MAX_CONCURRENT_AGENTS,
  DECOMPOSE_MAX_RETRIES,
  TaskStatus,
  AgentStatus,
} from "./index.js";

describe("constants", () => {
  it("AGENT_TIMEOUT_MS is 30 seconds", () => {
    expect(AGENT_TIMEOUT_MS).toBe(30_000);
  });

  it("MAX_CONCURRENT_AGENTS is 2", () => {
    expect(MAX_CONCURRENT_AGENTS).toBe(2);
  });

  it("DECOMPOSE_MAX_RETRIES is 3", () => {
    expect(DECOMPOSE_MAX_RETRIES).toBe(3);
  });
});

describe("TaskStatus", () => {
  it("has all lifecycle states", () => {
    expect(TaskStatus.Pending).toBe("pending");
    expect(TaskStatus.Processing).toBe("processing");
    expect(TaskStatus.Running).toBe("running");
    expect(TaskStatus.Complete).toBe("complete");
    expect(TaskStatus.Failed).toBe("failed");
  });

  it("has exactly 5 states", () => {
    expect(Object.keys(TaskStatus)).toHaveLength(5);
  });
});

describe("AgentStatus", () => {
  it("has all lifecycle states", () => {
    expect(AgentStatus.Hired).toBe("hired");
    expect(AgentStatus.Running).toBe("running");
    expect(AgentStatus.Complete).toBe("complete");
    expect(AgentStatus.Failed).toBe("failed");
  });

  it("has exactly 4 states", () => {
    expect(Object.keys(AgentStatus)).toHaveLength(4);
  });
});
