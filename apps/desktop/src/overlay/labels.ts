export const BUBBLE_MAX_WIDTH = 150;
export const BUBBLE_PADDING = 16;
export const BUBBLE_OUTLINE = 4;
export const LABEL_SPACING = 4;
export const LABEL_TURN_MS = 3000;

export interface LabelBox {
  id: string;
  center: number;
  left: number;
  right: number;
}

export function bubbleWidth(textWidth: number): number {
  return Math.min(BUBBLE_MAX_WIDTH, Math.ceil(textWidth) + BUBBLE_PADDING) + BUBBLE_OUTLINE;
}

export function nameWidth(textWidth: number, gap: number): number {
  return Math.min(Math.ceil(textWidth), Math.max(24, gap - LABEL_SPACING));
}

export function clampCenter(x: number, half: number, stripWidth: number): number {
  return Math.min(Math.max(x, half), Math.max(half, stripWidth - half));
}

export function labelBox(id: string, x: number, width: number, stripWidth: number): LabelBox {
  const half = width / 2;
  const center = clampCenter(x, half, stripWidth);
  return { id, center, left: center - half, right: center + half };
}

export function visibleLabels(boxes: LabelBox[], turn: number, spacing = LABEL_SPACING): Set<string> {
  const sorted = [...boxes].sort((a, b) => a.left - b.left || a.id.localeCompare(b.id));
  const n = sorted.length;
  const start = n === 0 ? 0 : ((Math.floor(turn) % n) + n) % n;
  const shown: LabelBox[] = [];
  for (const box of [...sorted.slice(start), ...sorted.slice(0, start)]) {
    if (shown.some((s) => box.left < s.right + spacing && s.left < box.right + spacing)) continue;
    shown.push(box);
  }
  return new Set(shown.map((b) => b.id));
}
