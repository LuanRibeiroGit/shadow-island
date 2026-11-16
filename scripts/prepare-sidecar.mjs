#!/usr/bin/env node
// Builds the `ids-hook` relay and copies it to src-tauri/binaries with the target
// triple suffix Tauri's `externalBin` expects (e.g. ids-hook-x86_64-pc-windows-msvc.exe).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profile = process.argv.includes("--debug") ? "debug" : "release";
const targetArg = process.argv.find((a) => a.startsWith("--target="))?.slice(9);
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1];
const triple = targetArg ?? host;
const args = ["build", "-p", "ids-hook"];
if (profile === "release") args.push("--release");
if (targetArg) args.push("--target", targetArg);
execFileSync("cargo", args, { cwd: root, stdio: "inherit" });

const ext = triple.includes("windows") ? ".exe" : "";
const src = join(root, "target", ...(targetArg ? [targetArg] : []), profile, `ids-hook${ext}`);
const outDir = join(root, "apps/desktop/src-tauri/binaries");
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, `ids-hook-${triple}${ext}`);
copyFileSync(src, dest);
// Dev runs (cargo/tauri dev) execute from target/<profile>: put a copy there too.
copyFileSync(src, join(root, "target", "debug", `ids-hook${ext}`));
console.log(`sidecar ready: ${dest}`);
