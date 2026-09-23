/** Standard developer revenue share rate (70%). */
export const STANDARD_REVENUE_SHARE = 0.7;
/** Founding developer revenue share rate (80%), locked permanently. */
export const FOUNDING_REVENUE_SHARE = 0.8;
/** Minimum payout threshold in cents ($10). Earnings below this roll over. */
export const MIN_PAYOUT_CENTS = 1000;
/** Default per-execution fee in cents. */
export const DEFAULT_EXECUTION_FEE_CENTS = 10;

/** A developer's billing account linked to Stripe Connect. */
export interface DeveloperAccount {
  id: string;
  user_id: string;
  stripe_connect_id: string | null;
  revenue_share_rate: number;
  is_founding_developer: boolean;
  created_at: string;
}

/** A per-execution fee record with developer/platform revenue split. */
export interface ExecutionCharge {
  id: string;
  task_agent_id: string;
  agent_id: string;
  developer_account_id: string;
  execution_fee_cents: number;
  developer_share_cents: number;
  platform_share_cents: number;
  status: "pending" | "processed" | "paid" | "failed";
  created_at: string;
}

/** Aggregated weekly payout summary for a developer account. */
export interface PayoutSummary {
  id: string;
  developer_account_id: string;
  period_start: string;
  period_end: string;
  total_earned_cents: number;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
}

/** Compute the developer and platform shares for an execution fee. Rounds developer share to the nearest cent; platform receives the remainder. */
export function computeRevenueSplit(
  feeCents: number,
  shareRate: number,
): { developerShare: number; platformShare: number } {
  const developerShare = Math.round(feeCents * shareRate);
  const platformShare = feeCents - developerShare;
  return { developerShare, platformShare };
}
