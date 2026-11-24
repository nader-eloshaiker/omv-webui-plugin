// SPDX-License-Identifier: GPL-3.0-or-later
// The density choice (foundation 5): comfortable or compact rows. A non-sensitive preference like the
// theme, the only kind of thing browser storage may hold (UI-13). It stores one word and nothing else;
// never server data, a user name or the session.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DENSITIES = ["comfortable", "compact"] as const;
export type DensityPreference = (typeof DENSITIES)[number];

export const DENSITY_STORAGE_KEY = "omv-webui.density";

export const isDensity = (value: unknown): value is DensityPreference =>
  typeof value === "string" && (DENSITIES as readonly string[]).includes(value);

interface DensityState {
  density: DensityPreference;
  setDensity: (density: DensityPreference) => void;
}

export const useDensityStore = create<DensityState>()(
  persist(
    (set) => ({
      density: "comfortable",
      setDensity: (density) => set({ density }),
    }),
    {
      name: DENSITY_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ density: state.density }),
      // Whatever is stored is checked: anything but one of the two words is ignored.
      merge: (stored, current) => {
        const density = (stored as { density?: unknown } | undefined)?.density;
        return isDensity(density) ? { ...current, density } : current;
      },
    },
  ),
);
