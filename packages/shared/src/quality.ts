/**
 * Provenance of every number shown in the UI (spec §10 "Precisão dos dados").
 * - real:        reported by Claude Code (hook payload or transcript usage block)
 * - calculated:  computed locally from real data (durations, counts)
 * - estimated:   derived with user-configured reference prices
 * - unavailable: no data; the UI shows "Indisponível"
 */
export type DataQuality = "real" | "calculated" | "estimated" | "unavailable";

export interface Measured<T> {
  value: T | null;
  quality: DataQuality;
}

export const measured = <T>(value: T | null | undefined, quality: Exclude<DataQuality, "unavailable">): Measured<T> =>
  value === null || value === undefined ? { value: null, quality: "unavailable" } : { value, quality };

export const unavailable = <T>(): Measured<T> => ({ value: null, quality: "unavailable" });
