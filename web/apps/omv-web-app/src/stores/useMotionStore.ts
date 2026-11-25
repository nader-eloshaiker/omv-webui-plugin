// SPDX-License-Identifier: GPL-3.0-or-later
// The animations preference (rethink decision 3, 7.1 rule 5): "Animations: Full" or "Reduced", on
// top of the system's prefers-reduced-motion. Reduced sets the same reduced tokens on <html> as the
// media query does (foundation 7.3), so every motion takes its reduced form. A non-sensitive
// preference like the theme, the only kind of thing browser storage may hold (UI-13): one word and
// nothing else; never server data, a user name or the session.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const MOTION_PREFERENCES = ["full", "reduced"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const MOTION_STORAGE_KEY = "omv-webui.motion";

export const isMotionPreference = (value: unknown): value is MotionPreference =>
  typeof value === "string" &&
  (MOTION_PREFERENCES as readonly string[]).includes(value);

interface MotionState {
  motion: MotionPreference;
  setMotion: (motion: MotionPreference) => void;
}

export const useMotionStore = create<MotionState>()(
  persist(
    (set) => ({
      motion: "full",
      setMotion: (motion) => set({ motion }),
    }),
    {
      name: MOTION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ motion: state.motion }),
      // Whatever is stored is checked: anything but one of the two words is ignored.
      merge: (stored, current) => {
        const motion = (stored as { motion?: unknown } | undefined)?.motion;
        return isMotionPreference(motion) ? { ...current, motion } : current;
      },
    },
  ),
);
