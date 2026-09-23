import {
  STANDARD_REVENUE_SHARE,
  FOUNDING_REVENUE_SHARE,
  MIN_PAYOUT_CENTS,
  DEFAULT_EXECUTION_FEE_CENTS,
  computeRevenueSplit,
} from "./billing.js";

describe("billing constants", () => {
  it("STANDARD_REVENUE_SHARE is 0.7", () => {
    expect(STANDARD_REVENUE_SHARE).toBe(0.7);
  });

  it("FOUNDING_REVENUE_SHARE is 0.8", () => {
    expect(FOUNDING_REVENUE_SHARE).toBe(0.8);
  });

  it("MIN_PAYOUT_CENTS is 1000 ($10)", () => {
    expect(MIN_PAYOUT_CENTS).toBe(1000);
  });

  it("DEFAULT_EXECUTION_FEE_CENTS is a positive number", () => {
    expect(DEFAULT_EXECUTION_FEE_CENTS).toBeGreaterThan(0);
  });
});

describe("computeRevenueSplit", () => {
  it("splits revenue at standard rate", () => {
    const result = computeRevenueSplit(100, STANDARD_REVENUE_SHARE);
    expect(result.developerShare).toBe(70);
    expect(result.platformShare).toBe(30);
  });

  it("splits revenue at founding rate", () => {
    const result = computeRevenueSplit(100, FOUNDING_REVENUE_SHARE);
    expect(result.developerShare).toBe(80);
    expect(result.platformShare).toBe(20);
  });

  it("developer + platform shares equal total fee", () => {
    const fee = 137;
    const result = computeRevenueSplit(fee, STANDARD_REVENUE_SHARE);
    expect(result.developerShare + result.platformShare).toBe(fee);
  });

  it("handles zero fee", () => {
    const result = computeRevenueSplit(0, STANDARD_REVENUE_SHARE);
    expect(result.developerShare).toBe(0);
    expect(result.platformShare).toBe(0);
  });

  it("rounds developer share to nearest cent", () => {
    // 33 * 0.7 = 23.1 → rounds to 23
    const result = computeRevenueSplit(33, 0.7);
    expect(result.developerShare).toBe(23);
    expect(result.platformShare).toBe(10);
  });
});
