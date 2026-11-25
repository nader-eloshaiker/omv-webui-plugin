// SPDX-License-Identifier: GPL-3.0-or-later
// Whether this browser has seen the dashboard's first visit (rethink 6.8, owner decision 10): the map
// assembling row by row, the welcome line and the newcomer captions. A non-sensitive preference like
// the theme, the only kind of thing browser storage may hold (UI-13): one boolean and nothing else;
// never server data, a user name or the session. When storage is missing or refuses, every visit is a
// first visit and nothing breaks. "Show me around" replays the visit without touching it.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const WELCOME_STORAGE_KEY = "omv-webui.seen.dashboard-welcome";

interface WelcomeState {
  seen: boolean;
  setSeen: (seen: boolean) => void;
}

export const useWelcomeStore = create<WelcomeState>()(
  persist(
    (set) => ({
      seen: false,
      setSeen: (seen) => set({ seen }),
    }),
    {
      name: WELCOME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ seen: state.seen }),
      // Whatever is stored is checked: anything but `true` is a first visit.
      merge: (stored, current) => ({
        ...current,
        seen: (stored as { seen?: unknown } | undefined)?.seen === true,
      }),
    },
  ),
);
