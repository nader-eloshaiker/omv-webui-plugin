// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

export type Density = "comfortable" | "compact";

/**
 * The density for the whole document from the Storybook toolbar, as the app sets it on <html>
 * (`data-density`), so popups in a portal follow it too.
 */
export function DocumentDensity({
  density,
  children,
}: {
  density: Density;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const root = document.documentElement;
    if (density === "compact") {
      root.setAttribute("data-density", "compact");
    } else {
      root.removeAttribute("data-density");
    }
  }, [density]);
  return children;
}
