// SPDX-License-Identifier: GPL-3.0-or-later
import { Toast } from "@base-ui/react/toast";
import type * as React from "react";

/**
 * Neutral for a plain confirmation; a state of health (OK, Warning, Critical) for a background
 * result about a monitored thing; a task word (Succeeded, Failed) for the result of a task.
 */
export type ToastTone =
  "neutral" | "ok" | "warning" | "critical" | "succeeded" | "failed";

interface ToastBase {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** One action, such as "Show task". A toast with an action stays until dismissed. */
  action?: { label: React.ReactNode; onClick: () => void };
}

/** A status toast carries its word, from the catalogue, not only its icon (style guide 5.10). */
export type ToastOptions = ToastBase &
  (
    | { tone?: "neutral"; statusLabel?: undefined }
    | { tone: Exclude<ToastTone, "neutral">; statusLabel: string }
  );

/** What the Toaster reads back from a toast. */
export interface ToastData {
  statusLabel?: string;
}

const SELF_DISMISSING: readonly ToastTone[] = ["neutral", "ok", "succeeded"];
const ASSERTIVE: readonly ToastTone[] = ["critical", "failed"];

/**
 * Shows a toast (style guide 5.10). Text only: never a secret or raw server output. Only a plain
 * confirmation or a success dismisses itself, after about 5 seconds; a warning, a failure or anything
 * with an action stays until dismissed. Critical and Failed are announced assertively.
 */
export function useToast() {
  const manager = Toast.useToastManager();
  return {
    show(options: ToastOptions) {
      const tone = options.tone ?? "neutral";
      const confirmation = SELF_DISMISSING.includes(tone) && !options.action;
      return manager.add<ToastData>({
        title: options.title,
        description: options.description,
        type: tone,
        timeout: confirmation ? 5000 : 0,
        priority: ASSERTIVE.includes(tone) ? "high" : "low",
        data: { statusLabel: options.statusLabel },
        actionProps: options.action
          ? { children: options.action.label, onClick: options.action.onClick }
          : undefined,
      });
    },
    close: manager.close,
  };
}
