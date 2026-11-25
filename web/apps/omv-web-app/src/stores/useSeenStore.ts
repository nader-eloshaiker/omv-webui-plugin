// SPDX-License-Identifier: GPL-3.0-or-later
// First-time flags (rethink P.3 layer G2, 7.1 rule 4): which one-time tips this browser has seen
// succeed or dismissed with "Got it", and which first-time flourishes have run in full. Each flag is a
// name from the fixed list below, so storage can only ever hold those names (UI-13): never server
// data, a user name or the session. When storage is missing or refuses, everything is a first time
// and nothing breaks. The dashboard's first visit keeps its own flag (useWelcomeStore).
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SEEN_STORAGE_KEY = "omv-webui.seen";

/** Every first-time flag there is. Add a name here before using it. */
export const SEEN_KEYS = [
  // G2 tips, each shown until its first success or "Got it".
  "tip.first-save",
  "tip.palette",
  "tip.trace",
  "tip.new-interface",
  // First-time flourishes, in full once, then a 160ms fade (7.1 rule 4).
  "motion.first-pending-flight",
  "motion.table-bars",
] as const;
export type SeenKey = (typeof SEEN_KEYS)[number];

export const isSeenKey = (value: unknown): value is SeenKey =>
  typeof value === "string" && (SEEN_KEYS as readonly string[]).includes(value);

interface SeenState {
  seen: SeenKey[];
  markSeen: (key: SeenKey) => void;
  /** Forget every flag: "Show me around" and the lab's reset. */
  reset: () => void;
}

export const useSeenStore = create<SeenState>()(
  persist(
    (set) => ({
      seen: [],
      markSeen: (key) =>
        set((state) =>
          state.seen.includes(key) ? state : { seen: [...state.seen, key] },
        ),
      reset: () => set({ seen: [] }),
    }),
    {
      name: SEEN_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ seen: state.seen }),
      // Whatever is stored is checked: only known names survive, each once.
      merge: (stored, current) => {
        const raw = (stored as { seen?: unknown } | undefined)?.seen;
        const seen = Array.isArray(raw)
          ? [...new Set(raw.filter(isSeenKey))]
          : [];
        return { ...current, seen };
      },
    },
  ),
);

/** Whether `key` has been seen, as a selector: `useSeenStore(hasSeen("tip.palette"))`. */
export const hasSeen =
  (key: SeenKey) =>
  (state: SeenState): boolean =>
    state.seen.includes(key);
