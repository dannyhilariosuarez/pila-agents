import { describe, it, expect } from "vitest";
import * as shared from "./index.js";

describe("shared package exports", () => {
  it("exports all constants", () => {
    expect(shared.AGENT_TIMEOUT_MS).toBeDefined();
    expect(shared.MAX_CONCURRENT_AGENTS).toBeDefined();
    expect(shared.DECOMPOSE_MAX_RETRIES).toBeDefined();
  });

  it("exports TaskStatus enum", () => {
    expect(shared.TaskStatus).toBeDefined();
    expect(shared.TaskStatus.Pending).toBe("pending");
    expect(shared.TaskStatus.Complete).toBe("complete");
  });

  it("exports AgentStatus enum", () => {
    expect(shared.AgentStatus).toBeDefined();
    expect(shared.AgentStatus.Hired).toBe("hired");
    expect(shared.AgentStatus.Complete).toBe("complete");
  });

  it("re-exports billing utilities", () => {
    expect(typeof shared.computeRevenueSplit).toBe("function");
    expect(shared.STANDARD_REVENUE_SHARE).toBe(0.70);
    expect(shared.FOUNDING_REVENUE_SHARE).toBe(0.80);
    expect(shared.MIN_PAYOUT_CENTS).toBe(1000);
  });

  it("re-exports versioning utilities", () => {
    expect(typeof shared.parseVersion).toBe("function");
    expect(typeof shared.compareVersions).toBe("function");
    expect(typeof shared.isBackwardsCompatible).toBe("function");
    expect(typeof shared.nextPatchVersion).toBe("function");
  });
});
