// SPDX-License-Identifier: GPL-3.0-or-later
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { backdropClass, popupClass } from "../dialog/dialog-classes";
import { Field, FieldControl, FieldLabel } from "../field/field";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** States the act and names the exact object: "Wipe disk /dev/sdb, WDC WD40EFRX, 3.6 TiB?" */
  title: React.ReactNode;
  /** The consequence in one plain sentence, with what depends on it (style guide 5.4). */
  description: React.ReactNode;
  /** Anything else the reader must see before deciding: the affected services, a dependency list. */
  children?: React.ReactNode;
  /** The act, as a verb with its object: "Wipe disk", "Apply changes". */
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  /**
   * `destructive` for anything that destroys data or cuts access: a warning-shaped icon beside the
   * title, the red confirm button, and focus starting on Cancel.
   */
  variant?: "default" | "destructive";
  /** The act is running: the confirm button shows it and ignores further presses. */
  pending?: boolean;
  /** Why the act failed, as text. The dialog stays open. */
  error?: React.ReactNode;
  /** Called on the confirm button only. The dialog does not close itself: close it on success. */
  onConfirm: () => void;
  className?: string;
}

/**
 * A confirmation, on Base UI's AlertDialog (`role="alertdialog"`; Escape and Cancel close it; the
 * scrim does not). There is no form, so Enter never confirms: only the confirm button does. A
 * destructive confirmation starts with focus on Cancel (style guide 5.4, UI-8).
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = "default",
  pending = false,
  error,
  onConfirm,
  className,
  confirmDisabled = false,
}: ConfirmDialogProps & {
  /** For the typed confirmation: keeps the act unavailable until its condition holds. */
  confirmDisabled?: boolean;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const destructive = variant === "destructive";
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropClass} />
        <AlertDialog.Popup
          data-slot="confirm-dialog"
          data-variant={variant}
          initialFocus={destructive ? cancelRef : true}
          className={cn(popupClass, className)}
        >
          <div className="flex items-start gap-3">
            {destructive ? (
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-foreground"
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1.5">
              <AlertDialog.Title className="text-lg leading-tight font-semibold text-foreground [overflow-wrap:anywhere]">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-base text-muted-foreground">
                {description}
              </AlertDialog.Description>
            </div>
          </div>
          {children}
          {error ? (
            <p
              role="alert"
              className="text-sm whitespace-pre-wrap text-critical-label"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <AlertDialog.Close
              ref={cancelRef}
              render={<Button variant="neutral" />}
            >
              {cancelLabel}
            </AlertDialog.Close>
            <Button
              data-slot="confirm-dialog-confirm"
              variant={destructive ? "destructive" : "primary"}
              loading={pending}
              disabled={confirmDisabled}
              focusableWhenDisabled
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

interface TypeToConfirmDialogProps extends Omit<ConfirmDialogProps, "variant"> {
  /** The exact text to type: the object's name. Case-sensitive; surrounding spaces are ignored. */
  confirmText: string;
  /**
   * The instruction, one translated sentence containing `confirmText` wherever the language puts it:
   * "Type media to confirm." The name is set in code type where it appears.
   */
  prompt: string;
}

// The name is set in code type by finding it in the sentence, so a translation keeps its own word
// order and no markup enters the catalogue. A sentence that lost the name still renders, as text.
function Prompt({ sentence, name }: { sentence: string; name: string }) {
  const at = name ? sentence.indexOf(name) : -1;
  if (at < 0) {
    return <>{sentence}</>;
  }
  return (
    <>
      {sentence.slice(0, at)}
      <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.95em] font-semibold [overflow-wrap:anywhere] text-foreground">
        {name}
      </code>
      {sentence.slice(at + name.length)}
    </>
  );
}

/**
 * The typed confirmation for what cannot be undone (style guide 5.4, UI-8): the reader types the
 * object's name, and the confirm button stays unavailable until it matches. It opens empty every time,
 * focus starts on Cancel, and Enter in the field does nothing.
 */
function TypeToConfirmDialog({
  confirmText,
  prompt,
  children,
  open,
  ...props
}: TypeToConfirmDialogProps) {
  const [typed, setTyped] = React.useState("");
  // Reset on the opening edge, during render, so the first frame is already empty.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
    }
  }
  const matches = typed.trim() === confirmText;
  return (
    <ConfirmDialog
      {...props}
      open={open}
      variant="destructive"
      confirmDisabled={!matches}
      onConfirm={() => {
        if (matches) {
          props.onConfirm();
        }
      }}
    >
      {children}
      <Field>
        <FieldLabel className="font-regular">
          <Prompt sentence={prompt} name={confirmText} />
        </FieldLabel>
        <FieldControl
          data-slot="type-to-confirm-input"
          value={typed}
          onValueChange={(value) => setTyped(value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
    </ConfirmDialog>
  );
}

export { ConfirmDialog, TypeToConfirmDialog };
export type { ConfirmDialogProps, TypeToConfirmDialogProps };
