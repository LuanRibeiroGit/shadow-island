import { describe, expect, it } from "vitest";
import type { Agent, Encounter } from "@ids/shared";
import { CLASSES, MessageScheduler, nextVisualChange, resolveCharacter, stepWalker, validateManifest, visualFor, ANIMATIONS, candidateMessages } from "./index";

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: "s#a",
  sessionId: "s",
  parentId: "s#main",
  agentId: "a",
  agentType: "Explore",
  specialty: "researcher",
  isMain: false,
  name: "Vesperina",
  cwd: "/p",
  state: "READING",
  activity: "reading",
  currentTool: "Read",
  detail: "main.rs",
  task: null,
  room: "library",
  startedAt: 0,
  updatedAt: 0,
  endedAt: null,
  lastEvent: "PreToolUse",
  ...over,
});

describe("visual state", () => {
  it("maps real states to animations", () => {
    expect(visualFor(agent({ state: "CODING" }), 0).animation).toBe("work");
    expect(visualFor(agent({ state: "EXPLORING" }), 0).moving).toBe(true);
    expect(visualFor(agent({ state: "IDLE" }), 0).energetic).toBe(false);
  });

  it("celebrations and errors settle to idle", () => {
    const a = agent({ state: "SUCCESS", updatedAt: 1000 });
    expect(visualFor(a, 2000).animation).toBe("cheer");
    expect(visualFor(a, 1000 + 5000).state).toBe("IDLE");
    expect(nextVisualChange(a, 2000)).toBe(5001);
    expect(nextVisualChange(agent(), 0)).toBeNull();
  });
});

describe("messages", () => {
  it("uses real details and never invents activities", () => {
    expect(candidateMessages(agent(), undefined)[0]).toBe("Lendo main.rs…");
    const generic = candidateMessages(agent({ state: "RUNNING", activity: "other", detail: null, lastEvent: "PreToolUse" }));
    expect(generic).toContain("Trabalhando…");
  });

  it("names the monster during combat", () => {
    const enc: Encounter = { id: 1, agentId: "s#a", sessionId: "s", monster: "test_phantom", signature: "Bash:npm test", status: "active", openedAt: 0, closedAt: null };
    expect(candidateMessages(agent({ state: "COMBAT" }), enc)[0]).toContain("Fantasma dos Testes");
  });

  it("does not repeat itself", () => {
    const s = new MessageScheduler(7000, 60000, 4500);
    const a = agent();
    const first = s.next(a, 0)!;
    expect(first.text).toBe("Lendo main.rs…");
    expect(s.next(a, 1000)!.text).toBe(first.text); // still visible
    expect(s.next(a, 5000)).toBeNull(); // expired, too soon for another
    const second = s.next(a, 8000);
    expect(second?.text).toBe("Analisando main.rs…");
    expect(s.next(a, 16000)).toBeNull(); // nothing new to say within the window
    const changed = s.next(agent({ state: "CODING", activity: "editing", detail: "lib.rs" }), 17000);
    expect(changed?.text).toBe("Editando lib.rs…");
  });
});

describe("characters", () => {
  it("resolves class by specialty and applies customization", () => {
    expect(resolveCharacter(agent(), {}).cls.id).toBe("wraith_scholar");
    expect(resolveCharacter(agent({ isMain: true }), {}).cls.id).toBe("lantern_keeper");
    const r = resolveCharacter(agent(), {
      "specialty:researcher": { classId: "ink_scribe", palette: { glow: "#fff" } },
      "agent:s#a": { name: "Lumi", scale: 9 },
    });
    expect(r.cls.id).toBe("ink_scribe");
    expect(r.name).toBe("Lumi");
    expect(r.palette.glow).toBe("#fff");
    expect(r.palette.cloak).toBe(CLASSES.ink_scribe!.palette.cloak);
    expect(r.scale).toBe(4);
  });

  it("walks toward a target", () => {
    let w = { x: 0, targetX: 10, facing: 1 as const };
    w = stepWalker(w, 500, 10) as typeof w;
    expect(w.x).toBe(5);
    expect(stepWalker({ x: 10, targetX: 0, facing: 1 }, 100, 10).facing).toBe(-1);
  });

  it("validates manifests", () => {
    const errors = validateManifest(
      { version: 1, characters: { x: { image: "a.png", frameWidth: 16, frameHeight: 16, anchorY: 15, animations: { idle: { row: 0, frames: 4, fps: 4, loop: true } } } }, monsters: {}, effects: {}, environments: {}, ui: {} },
      ANIMATIONS,
    );
    expect(errors.length).toBe(ANIMATIONS.length - 1);
  });
});
