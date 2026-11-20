// SPDX-License-Identifier: GPL-3.0-or-later
import { CSPProvider } from "@base-ui/react/csp-provider";
import { Toast } from "@base-ui/react/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import type * as React from "react";

interface UiProviderProps {
  children: React.ReactNode;
}

/**
 * Mount once at the root of anything that renders these components (the app, Storybook).
 *
 * `CSPProvider disableStyleElements` stops Base UI from inserting its one `<style>` element, which
 * the Content Security Policy blocks (UI-1, D7); the rule it carried is in css-ui-style. The toast and
 * tooltip providers give every toast one queue and every tooltip one shared delay.
 */
function UiProvider({ children }: UiProviderProps) {
  return (
    <CSPProvider disableStyleElements>
      <Tooltip.Provider delay={400}>
        <Toast.Provider>{children}</Toast.Provider>
      </Tooltip.Provider>
    </CSPProvider>
  );
}

export { UiProvider };
export type { UiProviderProps };
