// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface TopBarProps extends Omit<React.ComponentProps<"header">, "children"> {
  /** The product name, as text: this is an unofficial community plugin, so no logo artwork. */
  productName: React.ReactNode;
  /** The NAS's host name, from the backend, in the mono face. Hidden under 640px; truncates first. */
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
 * The top bar (style guide 5.1), on the page ground: the sky-blue identity bar is gone (foundation
 * 3.2). Its controls are `Button variant="quiet"` or `IconButton variant="quiet"`: ink on the bar,
 * never a filled button, with the ordinary focus ring.
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
        "flex min-h-12 items-center gap-2 border-b border-border bg-page px-2 text-foreground sm:gap-3 sm:px-4",
        className,
      )}
      {...props}
    >
      {navToggle ? <div className="flex lg:hidden">{navToggle}</div> : null}
      {/* The product name never gives way: it keeps its width (one step smaller under 640px), and
          the host name, hidden under 640px, is the one that truncates. */}
      <span className="shrink-0 text-base font-semibold whitespace-nowrap sm:text-lg">
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
