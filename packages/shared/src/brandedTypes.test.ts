import { describe, it, expect } from "vitest";
import {
  toUserId,
  toAgentId,
  toTaskId,
  toCents,
  toConfidence,
  toISOTimestamp,
  toNonEmpty,
} from "./brandedTypes.js";

describe("branded types", () => {
  describe("toUserId", () => {
    it("creates a UserId from a valid string", () => {
      const id = toUserId("user-123");
      expect(id).toBe("user-123");
    });

    it("throws on empty string", () => {
      expect(() => toUserId("")).toThrow("UserId cannot be empty");
    });

    it("throws on whitespace-only string", () => {
      expect(() => toUserId("   ")).toThrow("UserId cannot be empty");
    });
  });

  describe("toAgentId", () => {
    it("creates an AgentId from a valid string", () => {
      const id = toAgentId("flight-search-v2");
      expect(id).toBe("flight-search-v2");
    });

    it("throws on empty string", () => {
      expect(() => toAgentId("")).toThrow("AgentId cannot be empty");
    });
  });

  describe("toTaskId", () => {
    it("creates a TaskId from a valid UUID", () => {
      const id = toTaskId("123e4567-e89b-12d3-a456-426614174000");
      expect(id).toBe("123e4567-e89b-12d3-a456-426614174000");
    });

    it("throws on non-UUID string", () => {
      expect(() => toTaskId("not-a-uuid")).toThrow("Invalid TaskId format");
    });

    it("throws on empty string", () => {
      expect(() => toTaskId("")).toThrow("Invalid TaskId format");
    });
  });

  describe("toCents", () => {
    it("creates CentsAmount from a valid integer", () => {
      expect(toCents(1500)).toBe(1500);
    });

    it("allows zero", () => {
      expect(toCents(0)).toBe(0);
    });

    it("throws on negative number", () => {
      expect(() => toCents(-5)).toThrow("non-negative integer");
    });

    it("throws on non-integer", () => {
      expect(() => toCents(15.5)).toThrow("non-negative integer");
    });
  });

  describe("toConfidence", () => {
    it("passes through values between 0 and 1", () => {
      expect(toConfidence(0.75)).toBe(0.75);
    });

    it("clamps values above 1 to 1", () => {
      expect(toConfidence(1.5)).toBe(1);
    });

    it("clamps negative values to 0", () => {
      expect(toConfidence(-0.5)).toBe(0);
    });

    it("handles boundary values", () => {
      expect(toConfidence(0)).toBe(0);
      expect(toConfidence(1)).toBe(1);
    });
  });

  describe("toISOTimestamp", () => {
    it("creates ISO timestamp from a Date", () => {
      const date = new Date("2025-06-01T12:00:00Z");
      expect(toISOTimestamp(date)).toBe("2025-06-01T12:00:00.000Z");
    });

    it("creates ISO timestamp from current time if no date given", () => {
      const result = toISOTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("toNonEmpty", () => {
    it("creates NonEmptyString from a valid string", () => {
      expect(toNonEmpty("hello")).toBe("hello");
    });

    it("throws on empty string", () => {
      expect(() => toNonEmpty("")).toThrow("String cannot be empty");
    });

    it("throws on whitespace-only string", () => {
      expect(() => toNonEmpty("  ")).toThrow("String cannot be empty");
    });
  });
});
