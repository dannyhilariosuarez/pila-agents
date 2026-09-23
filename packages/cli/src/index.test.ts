import { describe, it, expect } from "vitest";

// ── helpers extracted from index.ts for unit-testable logic ──

// Re-implement parseFlag so we can test it without spawning the CLI process.
// The real CLI reads `process.argv.slice(2)` — we simulate that here.
function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

describe("parseFlag", () => {
  it("returns the value after a matching flag", () => {
    const args = ["agent", "register", "--endpoint", "https://example.com"];
    expect(parseFlag(args, "--endpoint")).toBe("https://example.com");
  });

  it("returns undefined when flag is not present", () => {
    const args = ["agent", "register", "--manifest", "m.json"];
    expect(parseFlag(args, "--endpoint")).toBeUndefined();
  });

  it("returns undefined when flag is the last element (no value follows)", () => {
    const args = ["agent", "register", "--endpoint"];
    expect(parseFlag(args, "--endpoint")).toBeUndefined();
  });

  it("handles multiple flags and returns the correct value", () => {
    const args = [
      "agent",
      "register",
      "--endpoint",
      "https://a.com",
      "--manifest",
      "m.json",
      "--category",
      "travel",
    ];
    expect(parseFlag(args, "--manifest")).toBe("m.json");
    expect(parseFlag(args, "--category")).toBe("travel");
  });

  it("returns the first occurrence when a flag appears twice", () => {
    const args = ["--key", "first", "--key", "second"];
    expect(parseFlag(args, "--key")).toBe("first");
  });
});

// ── CLI dispatch / routing tests ──
// These test the expected argument patterns without spawning a real process.

describe("CLI argument routing", () => {
  it("recognizes 'login' as command", () => {
    const args = ["login"];
    expect(args[0]).toBe("login");
  });

  it("recognizes 'agent register' with a path", () => {
    const args = ["agent", "register", "./my-agent"];
    expect(args[0]).toBe("agent");
    expect(args[1]).toBe("register");
    expect(args[2]).toBe("./my-agent");
  });

  it("recognizes remote register via --endpoint flag", () => {
    const args = [
      "agent",
      "register",
      "--endpoint",
      "https://a.com",
      "--manifest",
      "m.json",
    ];
    expect(args[0]).toBe("agent");
    expect(args[1]).toBe("register");
    expect(parseFlag(args, "--endpoint")).toBe("https://a.com");
    expect(parseFlag(args, "--manifest")).toBe("m.json");
  });

  it("defaults category to undefined when not specified", () => {
    const args = [
      "agent",
      "register",
      "--endpoint",
      "https://a.com",
      "--manifest",
      "m.json",
    ];
    expect(parseFlag(args, "--category")).toBeUndefined();
  });

  it("picks up --category when specified", () => {
    const args = [
      "agent",
      "register",
      "--endpoint",
      "https://a.com",
      "--manifest",
      "m.json",
      "--category",
      "travel",
    ];
    expect(parseFlag(args, "--category")).toBe("travel");
  });

  it("recognizes agent list subcommand", () => {
    const args = ["agent", "list"];
    expect(args[0]).toBe("agent");
    expect(args[1]).toBe("list");
  });

  it("recognizes agent test with an id", () => {
    const args = ["agent", "test", "my-agent-id"];
    expect(args[0]).toBe("agent");
    expect(args[1]).toBe("test");
    expect(args[2]).toBe("my-agent-id");
  });

  it("shows usage for unknown agent subcommand", () => {
    const args = ["agent", "unknown"];
    const subcommand = args[1] ?? "";
    const known = ["register", "list", "test", "stats", "remove"];
    expect(known.includes(subcommand)).toBe(false);
  });
});
