import {
  parseVersion,
  compareVersions,
  isBackwardsCompatible,
  nextPatchVersion,
  nextMinorVersion,
  nextMajorVersion,
} from "./versioning.js";

describe("parseVersion", () => {
  it("parses a valid semver string", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses 0.0.0", () => {
    expect(parseVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("returns null for invalid strings", () => {
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("1.2.3.4")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns positive when a > b (major)", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
  });

  it("returns negative when a < b (minor)", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
  });

  it("compares by patch", () => {
    expect(compareVersions("1.0.2", "1.0.1")).toBeGreaterThan(0);
  });

  it("returns 0 when both are invalid", () => {
    expect(compareVersions("bad", "also-bad")).toBe(0);
  });

  it("returns -1 when only a is invalid", () => {
    expect(compareVersions("bad", "1.0.0")).toBe(-1);
  });

  it("returns 1 when only b is invalid", () => {
    expect(compareVersions("1.0.0", "bad")).toBe(1);
  });
});

describe("isBackwardsCompatible", () => {
  it("returns true for same version", () => {
    expect(isBackwardsCompatible("1.0.0", "1.0.0")).toBe(true);
  });

  it("returns true for minor bump", () => {
    expect(isBackwardsCompatible("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true for patch bump", () => {
    expect(isBackwardsCompatible("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns false for major bump", () => {
    expect(isBackwardsCompatible("1.0.0", "2.0.0")).toBe(false);
  });

  it("returns false when new version is lower", () => {
    expect(isBackwardsCompatible("1.2.0", "1.1.0")).toBe(false);
  });

  it("returns false for invalid versions", () => {
    expect(isBackwardsCompatible("bad", "1.0.0")).toBe(false);
  });
});

describe("nextPatchVersion", () => {
  it("increments patch", () => {
    expect(nextPatchVersion("1.2.3")).toBe("1.2.4");
  });

  it("returns 1.0.1 for invalid input", () => {
    expect(nextPatchVersion("bad")).toBe("1.0.1");
  });
});

describe("nextMinorVersion", () => {
  it("increments minor and resets patch", () => {
    expect(nextMinorVersion("1.2.3")).toBe("1.3.0");
  });

  it("returns 1.1.0 for invalid input", () => {
    expect(nextMinorVersion("bad")).toBe("1.1.0");
  });
});

describe("nextMajorVersion", () => {
  it("increments major and resets minor and patch", () => {
    expect(nextMajorVersion("1.2.3")).toBe("2.0.0");
  });

  it("returns 2.0.0 for invalid input", () => {
    expect(nextMajorVersion("bad")).toBe("2.0.0");
  });
});
