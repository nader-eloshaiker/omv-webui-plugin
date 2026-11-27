// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" (rethink P.3, decision 3): one switch that turns off every G2 tip, the G1 captions and
// ghosts, and the welcome, for good. `offered` records that the one-time "Compact view on. Hide tips
// too?" toast has been shown, so it never comes back. Non-sensitive preferences like the theme, the
// only kind of thing browser storage may hold (UI-13): two booleans and nothing else.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const TIPS_STORAGE_KEY = "omv-webui.tips";

interface TipsState {
  show: boolean;
  offered: boolean;
  setShow: (show: boolean) => void;
  setOffered: (offered: boolean) => void;
}

export const useTipsStore = create<TipsState>()(
  persist(
    (set) => ({
      show: true,
      offered: false,
      setShow: (show) => set({ show }),
      setOffered: (offered) => set({ offered }),
    }),
    {
      name: TIPS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ show: state.show, offered: state.offered }),
      // Whatever is stored is checked: tips stay on unless `false` was stored, and the offer counts
      // as made only when `true` was stored.
      merge: (stored, current) => {
        const s = stored as { show?: unknown; offered?: unknown } | undefined;
        return {
          ...current,
          show: s?.show !== false,
          offered: s?.offered === true,
        };
      },
    },
  ),
);
