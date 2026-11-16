import { describe, expect, it } from "vitest";
import { restorationLevel } from "./layout";

describe("castle restoration", () => {
  it("follows real completed missions", () => {
    expect(restorationLevel(0)).toBe(0);
    expect(restorationLevel(1)).toBe(1);
    expect(restorationLevel(49)).toBe(2);
    expect(restorationLevel(1000)).toBe(5);
  });
});
