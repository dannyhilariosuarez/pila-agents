/** Parsed components of a semantic version string. */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a semver string into its major, minor, and patch components. */
export function parseVersion(version: string): SemanticVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/** Compare two semver strings. Returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (!va && !vb) return 0;
  if (!va) return -1;
  if (!vb) return 1;

  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

/** Check if a new version is backwards-compatible with an old version (same major). */
export function isBackwardsCompatible(
  oldVersion: string,
  newVersion: string,
): boolean {
  const vOld = parseVersion(oldVersion);
  const vNew = parseVersion(newVersion);

  if (!vOld || !vNew) return false;

  // Major version bump = breaking change
  if (vNew.major !== vOld.major) return false;

  // Same major, new must be >= old
  return compareVersions(newVersion, oldVersion) >= 0;
}

/** Increment the patch component of a semver string. */
export function nextPatchVersion(current: string): string {
  const v = parseVersion(current);
  if (!v) return "1.0.1";
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/** Increment the minor component and reset patch. */
export function nextMinorVersion(current: string): string {
  const v = parseVersion(current);
  if (!v) return "1.1.0";
  return `${v.major}.${v.minor + 1}.0`;
}

/** Increment the major component and reset minor and patch. */
export function nextMajorVersion(current: string): string {
  const v = parseVersion(current);
  if (!v) return "2.0.0";
  return `${v.major + 1}.0.0`;
}
