import { describe, it, expect } from "vitest";
import { PilaBaseAgent, ClaudeFallbackAgent, registerAgent } from "./index.js";

describe("protocol barrel exports", () => {
  it("exports PilaBaseAgent class", () => {
    expect(PilaBaseAgent).toBeDefined();
    expect(typeof PilaBaseAgent).toBe("function");
  });

  it("exports ClaudeFallbackAgent class", () => {
    expect(ClaudeFallbackAgent).toBeDefined();
    expect(typeof ClaudeFallbackAgent).toBe("function");
  });

  it("exports registerAgent function", () => {
    expect(registerAgent).toBeDefined();
    expect(typeof registerAgent).toBe("function");
  });
});
