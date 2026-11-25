// SPDX-License-Identifier: GPL-3.0-or-later
// Free text from the server in a table cell (a folder's description): at most three lines, then it is
// clipped with a "Show all" toggle in place. The toggle appears only when the text is clipped. Text is
// rendered as text (UI-2), in its own direction (`dir="auto"`), so a right-to-left value does not
// reorder the row.
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function ClampedText({ children }: { children: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !open) {
      setClipped(element.scrollHeight > element.clientHeight + 1);
    }
  }, [children, open]);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <p
        ref={ref}
        dir="auto"
        className={open ? "break-words" : "line-clamp-3 break-words"}
      >
        {children}
      </p>
      {clipped || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-h-6 rounded-sm text-sm text-link hover:underline"
        >
          {open ? t("sharedFolders.showLess") : t("sharedFolders.showAll")}
        </button>
      ) : null}
    </div>
  );
}
