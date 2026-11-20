// SPDX-License-Identifier: GPL-3.0-or-later
// Unsaved changes on leaving (phase 3 design 0.4): navigation inside the app asks first with the
// confirmation dialog; a reload or closing the tab gets the browser's own prompt. The session ending
// is never held up (the idle warning comes first, and sign-in must show). Form contents are never
// written anywhere to survive this (UI-6, UI-13).
import { ConfirmDialog } from "@omv-webui/react-ui-components";
import { useBlocker } from "@tanstack/react-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

export function LeaveGuard({ when }: { when: boolean }) {
  const { t } = useTranslation();
  // The blocker reads the latest value, not the one of the render that registered it.
  const whenRef = useRef(when);
  whenRef.current = when;
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      whenRef.current && next.pathname !== "/sign-in",
    enableBeforeUnload: () => whenRef.current,
    withResolver: true,
  });
  return (
    <ConfirmDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) {
          blocker.reset?.();
        }
      }}
      title={t("leave.title")}
      description={t("leave.body")}
      confirmLabel={t("leave.confirm")}
      cancelLabel={t("leave.cancel")}
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
