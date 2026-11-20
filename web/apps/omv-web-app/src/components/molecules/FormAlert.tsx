// SPDX-License-Identifier: GPL-3.0-or-later
// A message about the whole form, above its fields: why sign-in failed, or why it is showing. An
// error is critical (role="alert", announced at once); a notice is neutral (role="status"). Never
// colour alone: each has its icon and a title. Text from the backend is rendered as text (UI-2,
// UI-9).
import { cn } from "@omv-webui/react-ui-components";
import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";

interface FormAlertProps {
  tone: "critical" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
}

export function FormAlert({ tone, title, children }: FormAlertProps) {
  const critical = tone === "critical";
  const Icon = critical ? CircleAlert : Info;
  return (
    <div
      role={critical ? "alert" : "status"}
      data-tone={tone}
      className={cn(
        "flex gap-2.5 rounded-control border px-3 py-2.5 text-base",
        critical
          ? "border-critical-stroke bg-surface text-foreground"
          : "border-border bg-muted text-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          critical ? "text-critical-stroke" : "text-muted-foreground",
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        {title ? (
          <p
            className={cn(
              "font-medium",
              critical ? "text-critical-label" : "text-foreground",
            )}
          >
            {title}
          </p>
        ) : null}
        {children ? (
          <div className="flex flex-col gap-1">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
