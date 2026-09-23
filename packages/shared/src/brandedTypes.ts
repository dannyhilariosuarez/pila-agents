/**
 * Branded (nominal) types for compile-time safety.
 *
 * TypeScript uses structural typing, which means two types with the same
 * shape are interchangeable. Branded types add a phantom property to
 * prevent accidental mixing of semantically different string/number values.
 *
 * @example
 * ```ts
 * const userId = "user-123" as UserId;
 * const agentId = "agent-456" as AgentId;
 *
 * function getUser(id: UserId): User { ... }
 * getUser(agentId); // ✗ Type error — AgentId is not assignable to UserId
 * getUser(userId);  // ✓ OK
 * ```
 */

// ---------------------------------------------------------------------------
// Brand utility
// ---------------------------------------------------------------------------

/** Phantom brand tag — never exists at runtime. */
declare const __brand: unique symbol;

/** Creates a branded type from a base type and a brand tag. */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---------------------------------------------------------------------------
// Domain-specific branded types
// ---------------------------------------------------------------------------

/** A unique user identifier (e.g., Slack user ID or internal UUID). */
export type UserId = Brand<string, "UserId">;

/** A unique agent identifier (e.g., "flight-search-v2"). */
export type AgentId = Brand<string, "AgentId">;

/** A unique task identifier (UUID). */
export type TaskId = Brand<string, "TaskId">;

/** A unique developer account identifier. */
export type DeveloperAccountId = Brand<string, "DeveloperAccountId">;

/** A monetary amount in cents — prevents mixing dollars and cents. */
export type CentsAmount = Brand<number, "CentsAmount">;

/** A confidence score between 0 and 1. */
export type ConfidenceScore = Brand<number, "ConfidenceScore">;

/** An ISO 8601 timestamp string. */
export type ISOTimestamp = Brand<string, "ISOTimestamp">;

/** A non-empty string that has been validated. */
export type NonEmptyString = Brand<string, "NonEmptyString">;

// ---------------------------------------------------------------------------
// Smart constructors with runtime validation
// ---------------------------------------------------------------------------

/** Create a UserId from an unvalidated string. Throws if empty. */
export function toUserId(raw: string): UserId {
  if (!raw || raw.trim().length === 0) {
    throw new Error("UserId cannot be empty");
  }
  return raw as UserId;
}

/** Create an AgentId from an unvalidated string. Throws if empty. */
export function toAgentId(raw: string): AgentId {
  if (!raw || raw.trim().length === 0) {
    throw new Error("AgentId cannot be empty");
  }
  return raw as AgentId;
}

/** Create a TaskId from an unvalidated string. Throws if not UUID-shaped. */
export function toTaskId(raw: string): TaskId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    throw new Error(`Invalid TaskId format: ${raw}`);
  }
  return raw as TaskId;
}

/** Create a CentsAmount from a number. Throws if negative or non-integer. */
export function toCents(raw: number): CentsAmount {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new Error(`CentsAmount must be a non-negative integer, got ${raw}`);
  }
  return raw as CentsAmount;
}

/** Create a ConfidenceScore from a number. Clamps to [0, 1]. */
export function toConfidence(raw: number): ConfidenceScore {
  return Math.max(0, Math.min(1, raw)) as ConfidenceScore;
}

/** Create an ISOTimestamp from a Date or the current time. */
export function toISOTimestamp(date?: Date): ISOTimestamp {
  return (date ?? new Date()).toISOString() as ISOTimestamp;
}

/** Create a NonEmptyString from a raw string. Throws if empty. */
export function toNonEmpty(raw: string): NonEmptyString {
  if (!raw || raw.trim().length === 0) {
    throw new Error("String cannot be empty");
  }
  return raw as NonEmptyString;
}
