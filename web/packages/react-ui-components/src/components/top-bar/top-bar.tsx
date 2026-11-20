// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface TopBarProps extends Omit<React.ComponentProps<"header">, "children"> {
  /** The product name, as text: this is an unofficial community plugin, so no logo artwork. */
  productName: React.ReactNode;
  /** The NAS's host name, from the backend, in the mono face. Hidden under 640px. */
  hostName?: string;
  /** The control that opens the navigation drawer under 1024px. Hidden from 1024px. */
  navToggle?: React.ReactNode;
  /** The pending-changes indicator, visible when the band has scrolled away (5.8). */
  pending?: React.ReactNode;
  /** The tasks menu: running and recently ended tasks. */
  tasks?: React.ReactNode;
  /** The user menu. */
  user?: React.ReactNode;
}

/**
 * The top bar (style guide 5.1) on the identity ground. Its controls are `Button variant="onIdentity"`
 * or `IconButton variant="onIdentity"`: ink on the bar, never a filled button. Every focus ring inside
 * it takes `focus-ring-on-identity`, which clears 3:1 on the bar (6.91:1 light, 9.48:1 dark).
 */
function TopBar({
  productName,
  hostName,
  navToggle,
  pending,
  tasks,
  user,
  className,
  ...props
}: TopBarProps) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        "flex min-h-12 items-center gap-2 bg-identity px-2 text-identity-foreground sm:gap-3 sm:px-4",
        "[&_:focus-visible]:outline-focus-ring-on-identity",
        className,
      )}
      {...props}
    >
      {navToggle ? <div className="flex lg:hidden">{navToggle}</div> : null}
      <span className="min-w-0 truncate text-lg font-semibold">
        {productName}
      </span>
      {hostName ? (
        <span className="hidden min-w-0 truncate font-mono text-sm sm:inline">
          {hostName}
        </span>
      ) : null}
      <span className="flex-1" />
      <div className="flex shrink-0 items-center gap-1">
        {pending}
        {tasks}
        {user}
      </div>
    </header>
  );
}

export { TopBar };
export type { TopBarProps };
