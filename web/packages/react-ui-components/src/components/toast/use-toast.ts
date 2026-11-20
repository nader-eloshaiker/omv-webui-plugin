// SPDX-License-Identifier: GPL-3.0-or-later
import { Toast } from "@base-ui/react/toast";
import type * as React from "react";

/** A confirmation is neutral or OK; a background result may also be Warning or Critical. */
export type ToastTone = "neutral" | "ok" | "warning" | "critical";

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** One action, such as "Show task". A toast with an action stays until dismissed. */
  action?: { label: React.ReactNode; onClick: () => void };
}

/**
 * Shows a toast (style guide 5.10). Text only: never a secret or raw server output. Only a plain
 * confirmation dismisses itself, after about 5 seconds; a warning, an error or anything with an action
 * stays until dismissed. Critical is announced assertively, everything else politely.
 */
export function useToast() {
  const manager = Toast.useToastManager();
  return {
    show({ title, description, tone = "neutral", action }: ToastOptions) {
      const confirmation = (tone === "neutral" || tone === "ok") && !action;
      return manager.add({
        title,
        description,
        type: tone,
        timeout: confirmation ? 5000 : 0,
        priority: tone === "critical" ? "high" : "low",
        actionProps: action
          ? { children: action.label, onClick: action.onClick }
          : undefined,
      });
    },
    close: manager.close,
  };
}
