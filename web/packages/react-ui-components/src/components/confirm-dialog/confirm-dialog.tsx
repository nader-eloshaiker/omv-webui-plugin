// SPDX-License-Identifier: GPL-3.0-or-later
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { buttonRowClass } from "../button/button-class";
import { CheckboxField } from "../checkbox-field/checkbox-field";
import { backdropClass, popupClass } from "../dialog/dialog-classes";
import { keepTabInside } from "../dialog/keep-tab-inside";
import { TypeToConfirmField } from "../type-to-confirm/type-to-confirm-field";
import { typedMatches } from "../type-to-confirm/typed-matches";

/** A titled list in the body: "What goes", "What stays". */
interface ConfirmDialogSection {
  /** The list's heading, drawn as an `h3`: "What goes". */
  title: React.ReactNode;
  /** One line each, only the ones that apply: "Their administrator rights." */
  items: readonly React.ReactNode[];
}

/** A choice made in the confirmation itself: "Also take alex off the access lists of 3 shared folders". */
interface ConfirmDialogCheckbox {
  label: React.ReactNode;
  /** What leaving it does: "If you leave this, those folders keep an entry for alex, …" */
  hint?: React.ReactNode;
  /**
   * A warning shown while it is ticked, also the checkbox's description and announced politely when
   * it appears: "After this, nobody can open Photos from other computers: alex was the only one with
   * access."
   */
  note?: React.ReactNode;
  /** Held by the caller, which sets it each time the dialog opens (ticked by default, for example). */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** States the act and names the exact object: "Wipe disk /dev/sdb, WDC WD40EFRX, 3.6 TiB?" */
  title: React.ReactNode;
  /**
   * The consequence in one plain sentence, with what depends on it (style guide 5.4). Set in the body
   * colour: it is the sentence the decision rests on. Required unless `sections` say it.
   */
  description?: React.ReactNode;
  /**
   * Titled lists under the sentence: "What goes" and "What stays", each an `h3` and a list. With the
   * sentence they are the dialog's description, read with its title when it opens.
   */
  sections?: readonly ConfirmDialogSection[];
  /**
   * A checkbox after the lists and before `children` (and so before a typed confirmation): a
   * `CheckboxField` with its label, hint and the note shown while ticked.
   */
  checkbox?: ConfirmDialogCheckbox;
  /** Anything else the reader must see before deciding: the affected services, a dependency list. */
  children?: React.ReactNode;
  /** The act, as a verb with its object: "Wipe disk", "Apply 3 changes", "Undo 3 changes". */
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  /**
   * `destructive` for anything that destroys data or cuts access: a warning-shaped icon beside the
   * title and the red confirm button. Every confirmation starts with focus on Cancel.
   */
  variant?: "default" | "destructive";
  /** The act is running: the confirm button shows it and ignores further presses. */
  pending?: boolean;
  /** Why the act failed, as text. The dialog stays open. */
  error?: React.ReactNode;
  /** Called on the confirm button only. The dialog does not close itself: close it on success. */
  onConfirm: () => void;
  /** Keeps the act unavailable until a condition holds (the typed confirmation sets it). */
  confirmDisabled?: boolean;
  className?: string;
}

/**
 * A confirmation, on Base UI's AlertDialog (`role="alertdialog"`; Escape and Cancel close it; the
 * scrim does not). There is no form, so Enter never confirms: only the confirm button does. Focus
 * starts on Cancel (style guide 5.4, UI-8; the owner's decision for Undo), and Tab and Shift+Tab
 * cycle inside the dialog (`keepTabInside`).
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  sections,
  checkbox,
  children,
  confirmLabel,
  cancelLabel,
  variant = "default",
  pending = false,
  error,
  onConfirm,
  confirmDisabled = false,
  className,
}: ConfirmDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const destructive = variant === "destructive";
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropClass} />
        <AlertDialog.Popup
          data-slot="confirm-dialog"
          data-variant={variant}
          initialFocus={cancelRef}
          onKeyDown={keepTabInside}
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
              <AlertDialog.Title className="text-section text-foreground [overflow-wrap:anywhere]">
                {title}
              </AlertDialog.Title>
              {sections && sections.length > 0 ? (
                // One description for the sentence and the lists, so all of it is read with the title.
                <AlertDialog.Description
                  render={<div />}
                  className="flex flex-col gap-3 text-base text-foreground"
                >
                  {description ? <p>{description}</p> : null}
                  {sections.map((section, position) => (
                    <div
                      key={`section-${String(position)}`}
                      data-slot="confirm-dialog-section"
                      className="flex flex-col gap-1"
                    >
                      <h3 className="text-base font-semibold [overflow-wrap:anywhere] text-foreground">
                        {section.title}
                      </h3>
                      <ul className="flex list-disc flex-col gap-1 ps-5 [overflow-wrap:anywhere] marker:text-muted-foreground">
                        {section.items.map((item, line) => (
                          <li key={`item-${String(line)}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </AlertDialog.Description>
              ) : description ? (
                <AlertDialog.Description className="text-base text-foreground">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
          </div>
          {checkbox ? (
            <CheckboxField
              label={checkbox.label}
              hint={checkbox.hint}
              warning={checkbox.checked ? checkbox.note : undefined}
              checked={checkbox.checked}
              onCheckedChange={(checked) => checkbox.onCheckedChange(checked)}
              disabled={pending}
              focusableWhenDisabled
            />
          ) : null}
          {children}
          {error ? (
            <p
              role="alert"
              className="text-sm whitespace-pre-wrap text-critical-label"
            >
              {error}
            </p>
          ) : null}
          <div className={cn("mt-2 sm:justify-end", buttonRowClass)}>
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

interface TypeToConfirmDialogProps extends Omit<
  ConfirmDialogProps,
  "variant" | "confirmDisabled"
> {
  /** The exact text to type: the object's name. Case-sensitive; surrounding spaces are ignored. */
  confirmText: string;
  /**
   * The instruction, one translated sentence containing `confirmText` wherever the language puts it:
   * "Type /dev/sdb to confirm." The name is set in code type where it appears.
   */
  prompt: string;
}

/**
 * The typed confirmation for what cannot be undone (style guide 5.4, UI-8): the reader types the
 * object's name, and the confirm button stays unavailable until it matches. It opens empty every time,
 * focus starts on Cancel, and Enter in the field does nothing. A `checkbox` sits after the lists and
 * before `children` and the typed field.
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
  const matches = typedMatches(typed, confirmText);
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
      <TypeToConfirmField
        confirmText={confirmText}
        prompt={prompt}
        value={typed}
        onValueChange={setTyped}
      />
    </ConfirmDialog>
  );
}

export { ConfirmDialog, TypeToConfirmDialog };
export type {
  ConfirmDialogCheckbox,
  ConfirmDialogProps,
  ConfirmDialogSection,
  TypeToConfirmDialogProps,
};
