import type { Measured } from "@ids/shared";

export const UNAVAILABLE = "Indisponível";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return "< US$ 0,01";
  return `US$ ${n.toFixed(2).replace(".", ",")}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return UNAVAILABLE;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

export function formatMeasured<T>(m: Measured<T>, fmt: (v: T) => string): string {
  return m.value === null ? UNAVAILABLE : fmt(m.value);
}
