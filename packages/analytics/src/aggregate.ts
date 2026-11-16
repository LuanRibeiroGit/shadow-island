import type { Measured, ModelUsage, TokenTotals, UsageBucket } from "@ids/shared";

export const emptyTokens = (): TokenTotals => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0, records: 0 });

export function addTokens(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    cacheRead: a.cacheRead + b.cacheRead,
    records: a.records + b.records,
  };
}

export function sumUsage(usage: readonly ModelUsage[]): TokenTotals {
  return usage.reduce((acc, u) => addTokens(acc, u.tokens), emptyTokens());
}

/** Tokens are "real" when Claude Code reported at least one usage block. */
export function tokensMeasured(t: TokenTotals, pick: (t: TokenTotals) => number): Measured<number> {
  return t.records > 0 ? { value: pick(t), quality: "real" } : { value: null, quality: "unavailable" };
}

export interface SeriesPoint {
  t: number;
  [series: string]: number;
}

/**
 * Pivot usage buckets (one row per bucket+model) into chart points with one key per
 * model (input+output tokens). Missing buckets in the range are filled with 0 only
 * when the range had *some* usage; otherwise an empty array is returned so the chart
 * shows "Indisponível" rather than a fake zero line.
 */
export function pivotUsage(buckets: readonly UsageBucket[], from: number, to: number, bucketMs: number): { points: SeriesPoint[]; models: string[] } {
  if (buckets.length === 0) return { points: [], models: [] };
  const models = [...new Set(buckets.map((b) => b.model ?? "desconhecido"))].sort();
  const byT = new Map<number, SeriesPoint>();
  const start = Math.floor(Math.max(from, buckets[0]!.bucketStart) / bucketMs) * bucketMs;
  for (let t = start; t <= to; t += bucketMs) {
    const p: SeriesPoint = { t };
    for (const m of models) p[m] = 0;
    byT.set(t, p);
  }
  for (const b of buckets) {
    const p = byT.get(b.bucketStart) ?? { t: b.bucketStart };
    const key = b.model ?? "desconhecido";
    p[key] = (p[key] ?? 0) + b.tokens.input + b.tokens.output;
    byT.set(b.bucketStart, p);
  }
  return { points: [...byT.values()].sort((a, b) => a.t - b.t), models };
}
