import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./schema";

describe("settings schema", () => {
  it("fills defaults and ignores wrong types", () => {
    const s = mergeSettings({ desktop: { height: "big", showMessages: false }, general: { language: "en" }, future: 1 });
    expect(s.desktop.height).toBe(DEFAULT_SETTINGS.desktop.height);
    expect(s.desktop.showMessages).toBe(false);
    expect(s.general.language).toBe("en");
    expect((s as unknown as Record<string, unknown>).future).toBe(1);
  });
  it("accepts null-default values", () => {
    expect(mergeSettings({ desktop: { monitor: "HDMI-1" } }).desktop.monitor).toBe("HDMI-1");
    expect(mergeSettings(null).metrics.prices).toEqual([]);
  });
});
