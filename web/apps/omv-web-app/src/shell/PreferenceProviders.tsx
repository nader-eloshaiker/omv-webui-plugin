// SPDX-License-Identifier: GPL-3.0-or-later
// The two guidance preferences every screen sits in (rethink decisions 3 and 8): "Animations" for the
// library's motion (MotionProvider, and the reduced tokens on <html> so every transition reads them)
// and "Show tips" with this browser's first-time flags (TipsProvider). Both come from the preference
// stores (UI-13); the library reads no store itself.
import {
  applyReducedMotion,
  MotionProvider,
  TipsProvider,
} from "@omv-webui/react-ui-components";
import { useEffect, type ReactNode } from "react";
import { useMotionPreference } from "../hooks/useMotionPreference.ts";
import { useTipsPreference } from "../hooks/useTipsPreference.ts";

export function PreferenceProviders({ children }: { children: ReactNode }) {
  const reduced = useMotionPreference();
  const tips = useTipsPreference();
  useEffect(() => {
    applyReducedMotion(document.documentElement, reduced);
  }, [reduced]);
  return (
    <MotionProvider reduced={reduced}>
      <TipsProvider {...tips}>{children}</TipsProvider>
    </MotionProvider>
  );
}
