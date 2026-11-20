// SPDX-License-Identifier: GPL-3.0-or-later
// The theme choice: a non-sensitive preference, the only kind of thing browser storage may hold
// (UI-13). It stores one word and nothing else; never server data, a user name or the session.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "omv-webui.theme";

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === "string" &&
  (THEME_PREFERENCES as readonly string[]).includes(value);

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ preference: state.preference }),
      // Whatever is stored is checked: anything but one of the three words is ignored.
      merge: (stored, current) => {
        const preference = (stored as { preference?: unknown } | undefined)
          ?.preference;
        return isThemePreference(preference)
          ? { ...current, preference }
          : current;
      },
    },
  ),
);
