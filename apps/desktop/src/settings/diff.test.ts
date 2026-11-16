import { describe, expect, it } from "vitest";
import { collapse, lineDiff } from "./diff";

describe("lineDiff", () => {
  it("marks added and removed lines", () => {
    const d = lineDiff("a\nb\nc", "a\nx\nc\nd");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });
  it("handles a new file", () => {
    expect(lineDiff("", "{}").filter((l) => l.kind === "add")).toHaveLength(1);
  });
  it("collapses unchanged runs", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "X");
    const c = collapse(lineDiff(before, after), 1);
    expect(c[0]).toEqual({ kind: "gap", count: 9 });
    expect(c.filter((l) => l.kind === "add")).toHaveLength(1);
    expect(c.at(-1)).toEqual({ kind: "gap", count: 8 });
  });
});
