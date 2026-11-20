// SPDX-License-Identifier: GPL-3.0-or-later
// After each navigation, focus moves to the new page's title (WCAG 2.4.3), so keyboard and screen
// reader users start at the top of what changed. Not on the first load: focus starts at the skip link.
import { useRouter } from "@tanstack/react-router";
import { createContext, use, useEffect, useMemo, useRef } from "react";

export interface PageFocus {
  /** True once the user has navigated at least once in this page session. */
  navigated(): boolean;
}

export const PageFocusContext = createContext<PageFocus>({
  navigated: () => false,
});

export const usePageFocus = (): PageFocus => use(PageFocusContext);

/** Follow the router: any later change of path counts as a navigation. */
export function useNavigationTracker(): PageFocus {
  const router = useRouter();
  const navigated = useRef(false);
  useEffect(
    () =>
      router.subscribe("onBeforeLoad", (event) => {
        if (event.fromLocation && event.pathChanged) {
          navigated.current = true;
        }
      }),
    [router],
  );
  return useMemo(() => ({ navigated: () => navigated.current }), []);
}
