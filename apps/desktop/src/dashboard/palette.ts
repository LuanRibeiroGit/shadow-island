/**
 * Chart colors. The castle UI is always dark, so these are the dark-surface steps
 * of a categorical order validated (CVD + normal vision + 3:1 contrast) against
 * --panel-solid (#132427). Slots are assigned in fixed order and never cycled:
 * anything past the last slot folds into "Outros".
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"] as const;
export const OTHER = "#6b807b";
export const GRID = "#24443f";
export const AXIS_TEXT = "#8fb0a8";

/** Stable color for an entity: index in the sorted entity list, not its rank. */
export function colorFor(keys: readonly string[], key: string): string {
  const i = keys.indexOf(key);
  return i >= 0 && i < SERIES.length ? SERIES[i]! : OTHER;
}
