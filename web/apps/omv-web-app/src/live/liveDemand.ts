// SPDX-License-Identifier: GPL-3.0-or-later
// How often the shell's combined read runs (owner, 2026-11-24, "The new look", item 3): every 2 s
// while at least one chart is on screen, every 10 s on other pages, and not at all while the tab is
// hidden. Only an administrator's shell polls; a normal user's reads once, as before. Every read is a
// background call, so it never keeps an idle session alive (UI-14; useLive.ts).
//
// The demand is an external store: how many charts are mounted (each chart registers through
// useLiveSamples) and whether the tab is visible. The visibility listener is attached on the first
// subscriber and removed with the last, so importing this module does nothing.
import type { Role } from "@omv-webui/react-api-omv/generated";

/** While a chart is on screen. */
export const LIVE_CHART_MS = 2_000;
/** On every other page. */
export const LIVE_PAGE_MS = 10_000;
/** A System.getInformation or interface reply this recent is not read again when a page mounts. */
export const LIVE_STALE_MS = 10_000;

export interface LiveDemand {
  /** Charts mounted now. */
  charts: number;
  /** Whether the tab is visible (`document.visibilityState`). */
  visible: boolean;
}

/** The poll interval for the shell's combined read, or false for none. */
export function liveInterval(role: Role, demand: LiveDemand): number | false {
  if (role !== "admin" || !demand.visible) {
    return false;
  }
  return demand.charts > 0 ? LIVE_CHART_MS : LIVE_PAGE_MS;
}

const isVisible = (): boolean =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

export interface LiveDemandStore {
  getState(): LiveDemand;
  subscribe(listener: () => void): () => void;
  /** A chart came on screen. Returns its release, to call when it goes; calling it twice is harmless. */
  showChart(): () => void;
}

export function createLiveDemand(): LiveDemandStore {
  let state: LiveDemand = { charts: 0, visible: isVisible() };
  const listeners = new Set<() => void>();
  const change = (next: LiveDemand) => {
    if (next.charts === state.charts && next.visible === state.visible) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };
  // Also read on getState, so a render before the first subscription sees the tab as it is.
  const onVisibility = () => change({ ...state, visible: isVisible() });
  return {
    getState() {
      const visible = isVisible();
      if (visible !== state.visible) {
        state = { ...state, visible };
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibility);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", onVisibility);
        }
      };
    },
    showChart() {
      change({ ...state, charts: state.charts + 1 });
      let released = false;
      return () => {
        if (!released) {
          released = true;
          change({ ...state, charts: state.charts - 1 });
        }
      };
    },
  };
}

/** The application's one demand store, shared by the shell's poll and every chart. */
export const liveDemand: LiveDemandStore = createLiveDemand();
