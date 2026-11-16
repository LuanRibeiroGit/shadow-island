#!/usr/bin/env node
// DEVELOPMENT TOOL. Replays tests/fixtures/session-multiagent.jsonl through the real
// `ids-hook` relay into a running Ilha das Sombras, so the UI can be exercised
// without driving Claude Code by hand. Every replayed session id is rewritten to
// "sim-<time>" so it is obvious in the history which data is simulated. It never
// touches Claude Code settings or transcripts.
//
//   node scripts/simulate-session.mjs [--data-dir <dir>] [--delay 600]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const ID = "dev.ilhadassombras.app";
const defaultDataDir =
  platform() === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), ID)
    : platform() === "darwin"
      ? join(homedir(), "Library", "Application Support", ID)
      : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), ID);
const dataDir = arg("--data-dir", defaultDataDir);
const delay = Number(arg("--delay", "600"));
const exe = join(root, "target", "debug", platform() === "win32" ? "ids-hook.exe" : "ids-hook");

if (!existsSync(join(dataDir, "runtime.json"))) {
  console.error(`App não parece estar rodando: ${join(dataDir, "runtime.json")} não existe.`);
  process.exit(1);
}
if (!existsSync(exe)) {
  console.error(`Relay não encontrado em ${exe}. Rode: node scripts/prepare-sidecar.mjs --debug`);
  process.exit(1);
}

const sim = `sim-${Date.now().toString(36)}`;
const lines = readFileSync(join(root, "tests/fixtures/session-multiagent.jsonl"), "utf8").split("\n").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const line of lines) {
  const p = JSON.parse(line);
  p.session_id = sim;
  const r = spawnSync(exe, ["--data-dir", dataDir], { input: JSON.stringify(p), encoding: "utf8" });
  console.log(`${p.hook_event_name.padEnd(20)} ${p.tool_name ?? p.agent_type ?? ""} ${r.status === 0 ? "" : `(saída ${r.status})`}`);
  await sleep(delay);
}
console.log(`Sessão simulada ${sim} enviada (${lines.length} eventos).`);
