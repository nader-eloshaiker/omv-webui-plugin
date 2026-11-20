// SPDX-License-Identifier: GPL-3.0-or-later
import { Toast } from "@base-ui/react/toast";
import { Info, X } from "lucide-react";
import { cn } from "../../utils";
import { buttonClass } from "../button/button-class";
import { StatusIcon } from "../status/status";
import type { ToastTone } from "./use-toast";

interface ToasterProps {
  /** The accessible name of each toast's dismiss control: "Dismiss". */
  closeLabel: string;
  /** The name of the toast region, reachable with F6: "Notifications". */
  regionLabel: string;
  className?: string;
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "neutral") {
    return (
      <span aria-hidden="true" className="inline-flex">
        <Info className="size-4 text-muted-foreground" />
      </span>
    );
  }
  return <StatusIcon status={tone} className="size-4" />;
}

const STROKE: Record<ToastTone, string> = {
  neutral: "",
  ok: "text-ok-stroke",
  warning: "text-warning-stroke",
  critical: "text-critical-stroke",
};

/**
 * Renders the toasts queued with `useToast`, on Base UI's Toast. Mount once, inside `UiProvider`.
 * A neutral surface with an icon; a status toast takes the status icon, never a filled status ground.
 * Hover or focus pauses the timer; F6 reaches the region from the keyboard.
 */
function Toaster({ closeLabel, regionLabel, className }: ToasterProps) {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport
        aria-label={regionLabel}
        className={cn(
          "fixed end-4 bottom-4 z-60 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-hidden",
          className,
        )}
      >
        {toasts.map((toast) => {
          const tone = (toast.type ?? "neutral") as ToastTone;
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              data-slot="toast"
              className="rounded-card border border-border bg-popover text-popover-foreground shadow-md transition-opacity duration-base data-ending-style:opacity-0 data-starting-style:opacity-0"
            >
              <Toast.Content className="flex items-start gap-3 p-3">
                <span className={cn("mt-0.5 flex", STROKE[tone])}>
                  <ToneIcon tone={tone} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Toast.Title className="text-base font-medium" />
                  <Toast.Description className="text-sm text-muted-foreground" />
                  {toast.actionProps ? (
                    <Toast.Action
                      className={cn(
                        buttonClass({ variant: "neutral", size: "sm" }),
                        "mt-2 self-start",
                      )}
                    />
                  ) : null}
                </div>
                <Toast.Close
                  aria-label={closeLabel}
                  className={buttonClass({ variant: "ghost", size: "icon-sm" })}
                >
                  <X aria-hidden="true" className="text-muted-foreground" />
                </Toast.Close>
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export { Toaster };
export type { ToasterProps };
