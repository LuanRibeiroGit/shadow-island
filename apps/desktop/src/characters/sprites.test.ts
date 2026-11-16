import { describe, expect, it } from "vitest";
import { hexToRgb, recolorPixels } from "./sprites";

describe("recolor", () => {
  it("recolors key colors and their shades, leaves others", () => {
    const from = { cloak: "#2c4a52", trim: "#d7b45a", glow: "#7cf2c2" };
    const to = { cloak: "#ff0000", trim: "#d7b45a", glow: "#7cf2c2" };
    const cloak = hexToRgb(from.cloak);
    const dark = cloak.map((v) => Math.floor(v * 0.65));
    const data = new Uint8ClampedArray([...cloak, 255, ...dark, 255, 10, 18, 20, 255, 0, 0, 0, 0]);
    recolorPixels(data, from, to);
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);
    expect(data[4]).toBeGreaterThan(150);
    expect(data[5]).toBeLessThan(10);
    expect([data[8], data[9], data[10]]).toEqual([10, 18, 20]); // outline untouched
  });
});
