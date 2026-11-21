// SPDX-License-Identifier: GPL-3.0-or-later
// The one page title per page (style guide 5.1). It names the browser tab, and after a navigation it
// takes focus, so the reader starts at the top of the new page (pageFocus.ts).
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePageFocus } from "../../shell/pageFocus.ts";

export function PageTitle({
  children,
  documentTitle,
}: {
  children: string;
  /** The tab's name when it differs from the heading: "SMB/CIFS – Services". */
  documentTitle?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLHeadingElement>(null);
  const focus = usePageFocus();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.title = t("app.documentTitle", {
      page: documentTitle ?? children,
    });
  }, [children, documentTitle, t]);

  useEffect(() => {
    if (focus.navigated()) {
      ref.current?.focus();
    }
  }, [pathname, focus]);

  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className="text-2xl leading-tight font-semibold outline-hidden"
    >
      {children}
    </h1>
  );
}
