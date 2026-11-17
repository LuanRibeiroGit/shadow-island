import { describe, expect, it } from "vitest";
import type { ModelUsage, TokenTotals } from "@ids/shared";
import { ANTHROPIC_PRICES, estimateCost, findPrice, mergeReferencePrices, pivotUsage, sumUsage, tokensMeasured, validatePrice, formatDuration, formatTokens } from "./index";

const t = (input: number, output: number, records = 1): TokenTotals => ({ input, output, cacheCreation: 0, cacheRead: 0, records });
const prices = [
  { model: "claude-opus-5", input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  { model: "claude-opus-5-5", input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
];

describe("pricing", () => {
  it("never invents a cost without configured prices", () => {
    const usage: ModelUsage[] = [{ model: "claude-x", tokens: t(1000, 1000) }];
    const e = estimateCost(usage, []);
    expect(e.usd).toBeNull();
    expect(e.quality).toBe("unavailable");
    expect(e.unpricedModels).toEqual(["claude-x"]);
  });

  it("uses the longest matching prefix", () => {
    expect(findPrice("claude-opus-5-5-20261101", prices)?.input).toBe(5);
    expect(findPrice("claude-opus-5-20260101", prices)?.input).toBe(10);
    expect(findPrice(null, prices)).toBeUndefined();
  });

  it("estimates and reports partial coverage", () => {
    const usage: ModelUsage[] = [
      { model: "claude-opus-5", tokens: t(1_000_000, 0) },
      { model: "other", tokens: t(1_000_000, 0) },
    ];
    const e = estimateCost(usage, prices);
    expect(e.usd).toBeCloseTo(10);
    expect(e.quality).toBe("estimated");
    expect(e.coverage).toBeCloseTo(0.5);
    expect(e.unpricedModels).toEqual(["other"]);
  });

  it("ships a valid Anthropic reference table that prices the current models", () => {
    expect(ANTHROPIC_PRICES.every((p) => validatePrice(p) === null)).toBe(true);
    expect(findPrice("claude-opus-5-5", ANTHROPIC_PRICES)).toMatchObject({ input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 });
    expect(findPrice("claude-fable-5-2", ANTHROPIC_PRICES)).toMatchObject({ input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 });
    expect(findPrice("claude-opus-5-20260101", ANTHROPIC_PRICES)?.input).toBe(5);
  });

  it("merges reference prices without overwriting the user's rows", () => {
    const merged = mergeReferencePrices([prices[1]!], ANTHROPIC_PRICES);
    expect(merged.filter((p) => p.model === "claude-opus-5-5")).toEqual([prices[1]]);
    expect(merged).toHaveLength(ANTHROPIC_PRICES.length);
  });

  it("validates price rows", () => {
    expect(validatePrice({ model: "", input: 1, output: 1, cacheWrite: 1, cacheRead: 1 })).not.toBeNull();
    expect(validatePrice({ model: "m", input: -1, output: 1, cacheWrite: 1, cacheRead: 1 })).not.toBeNull();
    expect(validatePrice({ model: "m", input: 1, output: 1, cacheWrite: 1, cacheRead: 1 })).toBeNull();
  });
});

describe("aggregation", () => {
  it("distinguishes zero from unavailable", () => {
    expect(tokensMeasured(t(0, 0, 0), (x) => x.input)).toEqual({ value: null, quality: "unavailable" });
    expect(tokensMeasured(t(5, 0, 1), (x) => x.input)).toEqual({ value: 5, quality: "real" });
  });

  it("sums usage", () => {
    expect(sumUsage([{ model: "a", tokens: t(1, 2) }, { model: "b", tokens: t(3, 4) }])).toEqual(t(4, 6, 2));
  });

  it("pivots buckets per model and fills gaps", () => {
    const day = 86_400_000;
    const { points, models } = pivotUsage(
      [
        { bucketStart: 0, model: "a", tokens: t(1, 1) },
        { bucketStart: 2 * day, model: "b", tokens: t(5, 0) },
      ],
      0,
      2 * day,
      day,
    );
    expect(models).toEqual(["a", "b"]);
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({ t: day, a: 0, b: 0 });
    expect(points[2]!.b).toBe(5);
    expect(pivotUsage([], 0, day, day).points).toEqual([]);
  });

  it("formats", () => {
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(12_500_000)).toBe("13M");
    expect(formatDuration(65_000)).toBe("1min 5s");
    expect(formatDuration(-1)).toBe("Indisponível");
  });
});
