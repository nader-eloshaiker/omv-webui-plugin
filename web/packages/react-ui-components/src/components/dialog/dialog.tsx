// SPDX-License-Identifier: GPL-3.0-or-later
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type * as React from "react";
import { cn } from "../../utils";
import { buttonRowClass } from "../button/button-class";
import { backdropClass, popupClass } from "./dialog-classes";
import { keepTabInside } from "./keep-tab-inside";

/**
 * A modal dialog on Base UI's Dialog: focus moves in on open and back to the opener on close, Tab
 * and Shift+Tab cycle inside it (`keepTabInside`), the page behind is hidden from assistive technology
 * and does not scroll. For a confirmation use `ConfirmDialog` or
 * `TypeToConfirmDialog`.
 */
const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

function DialogContent({
  className,
  children,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClass} />
      <BaseDialog.Popup
        data-slot="dialog-content"
        className={cn(popupClass, className)}
        {...props}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          keepTabInside(event);
        }}
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
      className={cn("text-section text-foreground", className)}
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
