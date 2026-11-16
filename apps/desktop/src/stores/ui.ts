import { create } from "zustand";

export type Route =
  | { page: "home" }
  | { page: "castle"; room?: string }
  | { page: "dashboard" }
  | { page: "missions" }
  | { page: "history"; sessionId?: string }
  | { page: "characters" }
  | { page: "settings"; section?: string }
  | { page: "agent"; agentId: string };

interface UiStore {
  route: Route;
  go(route: Route): void;
}

export function parseRoute(s: string): Route | null {
  const [page, arg] = s.split("/", 2);
  switch (page) {
    case "agent":
      return arg ? { page: "agent", agentId: decodeURIComponent(arg) } : null;
    case "history":
      return { page: "history", sessionId: arg ? decodeURIComponent(arg) : undefined };
    case "castle":
      return { page: "castle", room: arg };
    case "settings":
      return { page: "settings", section: arg };
    case "home":
    case "dashboard":
    case "missions":
    case "characters":
      return { page };
    default:
      return null;
  }
}

export const useUi = create<UiStore>((set) => ({
  route: { page: "castle" },
  go: (route) => set({ route }),
}));
