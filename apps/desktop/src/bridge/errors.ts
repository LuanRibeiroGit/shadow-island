import { isTauri } from "./backend";

/** Forward uncaught UI errors to the native log (desktop only). */
export function installErrorReporter(): void {
  if (!isTauri()) return;
  const send = (message: string) => {
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("log_client_error", { message })).catch(() => {});
  };
  window.addEventListener("error", (e) => send(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => send(`unhandled: ${e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason)}`));
}
