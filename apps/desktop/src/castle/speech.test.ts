import { describe, expect, it } from "vitest";
import type { Agent } from "@ids/shared";
import { workSpeech } from "./speech";

const agent = (over: Partial<Agent>): Agent => ({
  id: "a",
  sessionId: "s",
  parentId: null,
  agentId: null,
  agentType: null,
  specialty: "general",
  isMain: true,
  name: "a",
  cwd: null,
  state: "RUNNING",
  activity: null,
  currentTool: null,
  detail: null,
  task: "o texto que o usuário mandou",
  room: "forge",
  startedAt: 1,
  updatedAt: 1,
  endedAt: null,
  lastEvent: null,
  ...over,
});

describe("work speech", () => {
  it("says what the agent is doing, in the first person", () => {
    expect(workSpeech(agent({ activity: "reading", currentTool: "Read", detail: "routes.ts" }), "READING")).toBe("Estou lendo routes.ts");
    expect(workSpeech(agent({ activity: "editing", currentTool: "Edit", detail: "scene.ts" }), "CODING")).toBe("Estou editando scene.ts");
    expect(workSpeech(agent({ activity: "testing", currentTool: "Bash" }), "TESTING")).toBe("Rodando os testes");
    expect(workSpeech(agent({ activity: "mcp", currentTool: "mcp__docs__read" }), "RUNNING")).toBe("Usando mcp__docs__read");
  });

  it("never repeats the user's prompt", () => {
    for (const state of ["RUNNING", "WAITING", "SUCCESS", "ERROR", "COMBAT"] as const) {
      expect(workSpeech(agent({}), state)).not.toContain("usuário");
    }
    expect(workSpeech(agent({}), "RUNNING")).toBe("Deixa eu pensar...");
    expect(workSpeech(agent({ currentTool: "Read", activity: "reading" }), "WAITING")).toBe("Estou esperando você...");
  });

  it("keeps long targets short", () => {
    const line = workSpeech(agent({ activity: "shell", currentTool: "Bash", detail: "x".repeat(200) }), "RUNNING");
    expect(line.length).toBeLessThanOrEqual(46);
    expect(line.endsWith("…")).toBe(true);
  });
});
