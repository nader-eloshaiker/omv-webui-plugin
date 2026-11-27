// SPDX-License-Identifier: GPL-3.0-or-later
import { Toast } from "@base-ui/react/toast";
import { Info, X } from "lucide-react";
import { cn } from "../../utils";
import { buttonClass } from "../button/button-class";
import { StatusLabel } from "../status/status";
import type { ToastData, ToastTone } from "./use-toast";

interface ToasterProps {
  /** The accessible name of each toast's dismiss control: "Dismiss". */
  closeLabel: string;
  /** The name of the toast region, reachable with F6: "Notifications". */
  regionLabel: string;
  className?: string;
}

/**
 * Renders the toasts queued with `useToast`, on Base UI's Toast. Mount once, inside `UiProvider`.
 * A neutral surface; a status toast leads with its status (its icon and word), never a filled status
 * ground. Hover or focus pauses the timer; F6 reaches the region from the keyboard.
 *
 * Under 640px the stack sits at the top, under the 48px top bar, where it covers headings rather than
 * the form controls and action rows that sit low on a narrow screen; from 640px it sits bottom-end.
 */
function Toaster({ closeLabel, regionLabel, className }: ToasterProps) {
  const { toasts } = Toast.useToastManager<ToastData>();
  return (
    <Toast.Portal>
      <Toast.Viewport
        aria-label={regionLabel}
        className={cn(
          "fixed inset-x-2 top-14 z-60 flex flex-col gap-2 outline-hidden",
          "sm:inset-x-auto sm:end-4 sm:top-auto sm:bottom-4 sm:w-[min(24rem,calc(100vw-2rem))]",
          className,
        )}
      >
        {toasts.map((toast) => {
          const tone = (toast.type ?? "neutral") as ToastTone;
          const statusLabel = toast.data?.statusLabel;
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              data-slot="toast"
              className={cn(
                "rounded-card surface-floating text-popover-foreground",
                // Entry from nothing (Base UI's starting style, CSS @starting-style semantics): it
                // rises and lands on the settle spring; it leaves faster on the exit curve
                // (foundation 7.2). Reduced motion: it is simply there.
                "transition-[opacity,translate,scale] duration-slow ease-settle",
                "data-starting-style:translate-y-3 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
                "data-ending-style:opacity-0 data-ending-style:duration-base data-ending-style:ease-exit",
              )}
            >
              <Toast.Content className="flex items-start gap-3 p-4">
                {tone !== "neutral" && statusLabel ? (
                  <StatusLabel status={tone} className="mt-0.5 shrink-0">
                    {statusLabel}
                  </StatusLabel>
                ) : (
                  <span aria-hidden="true" className="mt-0.5 flex">
                    <Info className="size-4 text-muted-foreground" />
                  </span>
                )}
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
