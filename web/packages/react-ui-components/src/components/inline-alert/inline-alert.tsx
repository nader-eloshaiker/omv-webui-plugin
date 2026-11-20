// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import { CircleAlert, Info } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

const alertClass = cva(
  "flex gap-2.5 rounded-control border px-3 py-2.5 text-base text-foreground",
  {
    variants: {
      tone: {
        // Why a form was refused: the critical stroke on the surface, the title in the critical ink.
        // A form error is not a system status (style guide 2), so there is no red ground.
        critical: "border-critical-stroke bg-surface",
        // Advice and notices. There is no "info" colour (2.1): neutral, with an icon.
        neutral: "border-border bg-muted",
      },
    },
  },
);

interface InlineAlertProps extends Omit<React.ComponentProps<"div">, "title"> {
  /**
   * `critical`: something the reader did failed (a save, a sign-in); announced at once
   * (`role="alert"`). `neutral`: a notice or a warning about the current values; announced politely
   * (`role="status"`). Pass `role` to override, for a notice already on screen when the page opens.
   */
  tone: "critical" | "neutral";
  /** One short line: "The SSH settings were not saved." */
  title?: React.ReactNode;
  /** What to do, and the server's message as a `ServerMessage` (UI-9). Rendered as given. */
  children?: React.ReactNode;
}

/**
 * A message inside a page or form, above the fields it concerns (style guide 5.3): why a save or a
 * sign-in failed, or a warning about the values in front of the reader. Never colour alone: each tone
 * has its icon, and a critical alert its title. Server text is passed as text. To move focus to it
 * after a failed save, give it a `ref` and `tabIndex={-1}`.
 */
function InlineAlert({
  tone,
  title,
  children,
  className,
  ...props
}: InlineAlertProps) {
  const critical = tone === "critical";
  const Icon = critical ? CircleAlert : Info;
  return (
    <div
      data-slot="inline-alert"
      data-tone={tone}
      role={critical ? "alert" : "status"}
      className={cn(alertClass({ tone }), className)}
      {...props}
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

export { InlineAlert };
export type { InlineAlertProps };
