// SPDX-License-Identifier: GPL-3.0-or-later
// The one page title per page (style guide 5.1). It names the browser tab, and after a navigation it
// takes focus, so the reader starts at the top of the new page (pageFocus.ts).
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePageFocus } from "../../shell/pageFocus.ts";

/**
 * A heading that is not plain text (a device set in code type: "Disk /dev/sdb") names the tab through
 * `documentTitle`, which is then required.
 */
type PageTitleProps = (
  | {
      children: string;
      /** The tab's name when it differs from the heading: "SMB/CIFS – Services". */
      documentTitle?: string;
    }
  | { children: ReactNode; documentTitle: string }
) & {
  /**
   * `eyebrow`: a small title above a page's answer (dashboard spec 4.1), at the section step in the
   * secondary ink. It stays the page's one `h1`, the focus target and the tab's name.
   */
  variant?: "page" | "eyebrow";
  /** For a region the title names (`aria-labelledby`). */
  id?: string;
};

const TITLE_CLASS = {
  page: "text-title text-foreground outline-hidden",
  eyebrow: "text-section text-muted-foreground outline-hidden",
} as const;

export function PageTitle({
  children,
  documentTitle,
  variant = "page",
  id,
}: PageTitleProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLHeadingElement>(null);
  const focus = usePageFocus();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const page = documentTitle ?? (typeof children === "string" ? children : "");
  useEffect(() => {
    document.title = t("app.documentTitle", { page });
  }, [page, t]);

  useEffect(() => {
    if (focus.navigated()) {
      ref.current?.focus();
    }
  }, [pathname, focus]);

  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={TITLE_CLASS[variant]}>
      {children}
    </h1>
  );
}
