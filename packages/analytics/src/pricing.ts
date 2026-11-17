import type { DataQuality, ModelUsage, TokenTotals } from "@ids/shared";

/**
 * Reference prices configured by the user, in USD per million tokens.
 * There are NO built-in prices: the app never invents costs (spec §10).
 */
export interface ModelPrice {
  /** Model id or prefix, e.g. "claude-opus-5" matches "claude-opus-5-20261101". */
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface CostEstimate {
  /** Estimated USD, or null when no used model has a configured price. */
  usd: number | null;
  quality: DataQuality;
  /** Models with usage but without a configured price. */
  unpricedModels: string[];
  /** Share of tokens covered by configured prices (0..1). */
  coverage: number;
}

export function findPrice(model: string | null, prices: readonly ModelPrice[]): ModelPrice | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase();
  // Longest matching prefix wins, so "claude-opus-5-5" beats "claude-opus-5".
  return [...prices]
    .filter((p) => p.model.trim() !== "" && m.startsWith(p.model.trim().toLowerCase()))
    .sort((a, b) => b.model.length - a.model.length)[0];
}

export const totalTokens = (t: TokenTotals): number => t.input + t.output + t.cacheCreation + t.cacheRead;

export function costOf(t: TokenTotals, p: ModelPrice): number {
  return (t.input * p.input + t.output * p.output + t.cacheCreation * p.cacheWrite + t.cacheRead * p.cacheRead) / 1_000_000;
}

export function estimateCost(usage: readonly ModelUsage[], prices: readonly ModelPrice[]): CostEstimate {
  let usd = 0;
  let priced = 0;
  let all = 0;
  const unpriced = new Set<string>();
  for (const u of usage) {
    const n = totalTokens(u.tokens);
    if (u.tokens.records === 0 || n === 0) continue;
    all += n;
    const p = findPrice(u.model, prices);
    if (p) {
      usd += costOf(u.tokens, p);
      priced += n;
    } else {
      unpriced.add(u.model ?? "modelo desconhecido");
    }
  }
  if (all === 0 || priced === 0) {
    return { usd: null, quality: "unavailable", unpricedModels: [...unpriced], coverage: 0 };
  }
  return { usd, quality: "estimated", unpricedModels: [...unpriced], coverage: priced / all };
}

/** Validate a user-entered price row. Returns an error message or null. */
export function validatePrice(p: ModelPrice): string | null {
  if (!p.model.trim()) return "Informe o modelo";
  for (const k of ["input", "output", "cacheWrite", "cacheRead"] as const) {
    const v = p[k];
    if (!Number.isFinite(v) || v < 0 || v > 10_000) return `Valor inválido em ${k}`;
  }
  return null;
}

export const ANTHROPIC_PRICES_AS_OF = "2026-11-03";

const standardRates = (model: string, input: number, output: number, cacheRead = input / 10): ModelPrice => ({
  model,
  input,
  output,
  cacheWrite: input * 1.25,
  cacheRead,
});

export const ANTHROPIC_PRICES: readonly ModelPrice[] = [
  standardRates("claude-fable-5-2", 8, 40, 0.2),
  standardRates("claude-fable-5-1", 10, 50),
  standardRates("claude-fable-5", 10, 50),
  standardRates("claude-opus-5-5", 4, 20, 0.2),
  standardRates("claude-opus-5", 5, 25),
  standardRates("claude-opus-4-8", 5, 25),
  standardRates("claude-opus-4-7", 5, 25),
  standardRates("claude-opus-4-6", 5, 25),
  standardRates("claude-sonnet-5-5", 2, 10, 0.1),
  standardRates("claude-sonnet-5", 2, 10),
  standardRates("claude-sonnet-4-6", 3, 15),
  standardRates("claude-haiku-5-5", 0.1, 0.5),
  standardRates("claude-haiku-4-5", 1, 5),
];

export function mergeReferencePrices(current: readonly ModelPrice[], reference: readonly ModelPrice[]): ModelPrice[] {
  const configured = new Set(current.map((p) => p.model));
  return [...current, ...reference.filter((p) => !configured.has(p.model))];
}
