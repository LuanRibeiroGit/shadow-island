import { describe, expect, it } from "vitest";
import { BUBBLE_MAX_WIDTH, BUBBLE_OUTLINE, bubbleWidth, clampCenter, labelBox, nameWidth, visibleLabels } from "./labels";

describe("speech bubbles and names on the strip", () => {
  it("keeps bubbles on one short line", () => {
    expect(bubbleWidth(40)).toBe(60);
    expect(bubbleWidth(900)).toBe(BUBBLE_MAX_WIDTH + BUBBLE_OUTLINE);
  });

  it("keeps names narrower than the room between two souls", () => {
    expect(nameWidth(30.2, 64)).toBe(31);
    expect(nameWidth(200, 64)).toBe(60);
    expect(nameWidth(200, 10)).toBe(24);
  });

  it("keeps labels inside the strip near its edges", () => {
    expect(clampCenter(10, 50, 1000)).toBe(50);
    expect(clampCenter(990, 50, 1000)).toBe(950);
    expect(labelBox("a", 10, 100, 1000)).toEqual({ id: "a", center: 50, left: 0, right: 100 });
  });

  it("shows every bubble that does not touch another one", () => {
    const boxes = [labelBox("a", 100, 150, 1920), labelBox("b", 400, 150, 1920), labelBox("c", 700, 150, 1920)];
    expect(visibleLabels(boxes, 0)).toEqual(new Set(["a", "b", "c"]));
  });

  it("shows only one of two overlapping bubbles and takes turns between them", () => {
    const boxes = [labelBox("a", 300, 150, 1920), labelBox("b", 380, 150, 1920), labelBox("c", 900, 150, 1920)];
    const turns = [0, 1, 2, 3].map((t) => visibleLabels(boxes, t));
    for (const shown of turns) {
      expect(shown.has("c")).toBe(true);
      expect(shown.has("a") && shown.has("b")).toBe(false);
    }
    expect(turns.some((s) => s.has("a"))).toBe(true);
    expect(turns.some((s) => s.has("b"))).toBe(true);
  });

  it("never shows two bubbles that overlap, however crowded the strip is", () => {
    const boxes = Array.from({ length: 9 }, (_, i) => labelBox(`s${i}`, 60 + i * 50, 150, 600));
    for (let turn = 0; turn < 9; turn++) {
      const shown = boxes.filter((b) => visibleLabels(boxes, turn).has(b.id));
      for (const a of shown) for (const b of shown) if (a !== b) expect(a.right <= b.left || b.right <= a.left).toBe(true);
    }
  });
});
