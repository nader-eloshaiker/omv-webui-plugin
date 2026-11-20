// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

/**
 * An identifier inside running text: a device path, a share name, a serial number, an address
 * (style guide 4.1). Set in the mono face so it reads as something to copy or compare, and allowed to
 * break anywhere so a long path never pushes the layout sideways. Place it in a translated sentence
 * with the app's `<Trans>` component, so the language keeps its own word order.
 */
function Identifier({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="identifier"
      className={cn(
        "font-mono text-[0.92em] [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

export { Identifier };
