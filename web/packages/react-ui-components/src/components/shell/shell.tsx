// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface ShellProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The skip link: the first thing Tab reaches. */
  skipLink?: React.ReactNode;
  /** The `TopBar`: sticky, blurring the page under it. */
  topBar: React.ReactNode;
  /** Notices for the whole visit, directly under the top bar: the unencrypted-connection notice (UI-12). */
  notices?: React.ReactNode;
  /** The `PendingBand`: under the notices, sticking under the top bar while it is shown. */
  pending?: React.ReactNode;
  /** The `SideNav`, shown beside the content from 1024px (the drawer takes its place below). */
  sidebar?: React.ReactNode;
  /** The main region's id, the skip link's target. */
  mainId: string;
  /** The page. */
  children: React.ReactNode;
  /** Dialogs, the drawer, the palette and the toasts: outside the layout. */
  overlays?: React.ReactNode;
}

/**
 * The application shell (foundation 10): the page ground with the ambient light from above, then in
 * order and never side by side the skip link, the top bar, the notices (UI-12) and the pending band,
 * then the sidebar beside the page. The top bar, sidebar and band are named for the page-change view
 * transition and stay still while the page in `main` fades and scales up from 0.985 (foundation 7.2;
 * the rules are in css-ui-style). `main` takes focus from the skip link without drawing a ring.
 */
function Shell({
  skipLink,
  topBar,
  notices,
  pending,
  sidebar,
  mainId,
  children,
  overlays,
  className,
  ...props
}: ShellProps) {
  return (
    <div
      data-slot="shell"
      className={cn(
        "relative isolate flex min-h-dvh flex-col bg-page text-foreground",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] ambient-light"
      />
      {skipLink}
      {topBar}
      {notices}
      {pending}
      <div className="flex flex-1 items-start">
        {sidebar ? (
          <aside
            data-slot="shell-sidebar"
            className={cn(
              "sticky top-15 hidden h-[calc(100dvh-3.75rem)] w-68 shrink-0 overflow-y-auto overscroll-contain lg:block",
              "compact:top-13 compact:h-[calc(100dvh-3.25rem)] compact:w-60 [view-transition-name:shell-nav]",
            )}
          >
            {sidebar}
          </aside>
        ) : null}
        <main
          id={mainId}
          tabIndex={-1}
          data-slot="shell-main"
          className="min-w-0 flex-1 px-4 pt-6 pb-16 outline-hidden sm:px-6 lg:px-8 lg:pt-8 [view-transition-name:shell-main]"
        >
          <div className="mx-auto w-full max-w-[90rem]">{children}</div>
        </main>
      </div>
      {overlays}
    </div>
  );
}

export { Shell };
export type { ShellProps };
