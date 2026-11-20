// SPDX-License-Identifier: GPL-3.0-or-later
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type * as React from "react";
import { cn } from "../../utils";
import { buttonRowClass } from "../button/button-class";
import { backdropClass, popupClass } from "./dialog-classes";

/**
 * A modal dialog on Base UI's Dialog: focus moves in on open and back to the opener on close, the
 * page behind is inert and does not scroll. For a confirmation use `ConfirmDialog` or
 * `TypeToConfirmDialog`.
 */
const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClass} />
      <BaseDialog.Popup
        data-slot="dialog-content"
        className={cn(popupClass, className)}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn(
        "text-lg leading-tight font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn("text-base text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The buttons: Cancel first, the act last; stacked full width under 640px. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 sm:justify-end", buttonRowClass, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
