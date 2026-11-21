// SPDX-License-Identifier: GPL-3.0-or-later
// The shape of the RAID page's dialogs (phase 5 RAID design 5.2 to 5.5, 6.2, 7.2 to 7.4): it opens at
// once with "Checking…" while its re-reads run (Cancel available), then shows a refusal that appeared
// meanwhile (with Close), or the confirmation. The confirmation keeps ConfirmDialog's semantics, which
// ConfirmDialog cannot carry through these states: an alert dialog, focus starting on Cancel, no form
// (Enter never confirms), Escape and Cancel close it and the scrim does not; the destructive form has
// the warning shape and the red button with its verb, and a typed one keeps its button unavailable
// until the name matches. While the act runs, Cancel is unavailable.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  TypeToConfirmField,
  typedMatches,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";

export type CheckedPhase =
  | { kind: "checking" }
  | { kind: "refused"; title: ReactNode; body: ReactNode }
  | { kind: "confirm"; rechecking?: boolean; running?: boolean };

export function CheckedDialog({
  open,
  onClose,
  phase,
  checkingTitle,
  checkingLabel,
  title,
  description,
  children,
  destructive = false,
  typed,
  confirmLabel,
  recheckingLabel,
  runningLabel,
  cancelLabel,
  closeLabel,
  error,
  onConfirm,
  openerRef,
}: {
  open: boolean;
  onClose: () => void;
  phase: CheckedPhase;
  /** The title while checking: the act and its object. */
  checkingTitle: ReactNode;
  /** "Checking…". */
  checkingLabel: string;
  title: ReactNode;
  /** The consequence, read with the title. */
  description: ReactNode;
  children?: ReactNode;
  destructive?: boolean;
  /** The name to type, with the prompt (the field's label) and the hint linked to the button. */
  typed?: { confirmText: string; prompt: string; hint: string };
  confirmLabel: string;
  recheckingLabel: string;
  /** "Taking /dev/sdb out…", announced while the act runs. */
  runningLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Why the act failed, as our sentence and the server's text; the dialog stays open. */
  error?: ReactNode;
  onConfirm: () => void;
  openerRef?: RefObject<HTMLElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const [value, setValue] = useState("");
  // Open empty every time (reset on the opening edge, during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue("");
    }
  }
  const confirming = phase.kind === "confirm";
  const busy =
    phase.kind === "checking" ||
    (phase.kind === "confirm" &&
      (phase.rechecking === true || phase.running === true));
  const running = phase.kind === "confirm" && phase.running === true;
  const matches = typed === undefined || typedMatches(value, typed.confirmText);

  let shownTitle: ReactNode = title;
  let shownDescription: ReactNode = description;
  if (phase.kind === "checking") {
    shownTitle = checkingTitle;
    shownDescription = checkingLabel;
  } else if (phase.kind === "refused") {
    shownTitle = phase.title;
    shownDescription = phase.body;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !running) {
          onClose();
        }
      }}
      disablePointerDismissal
    >
      <DialogContent
        role="alertdialog"
        aria-busy={busy || undefined}
        initialFocus={cancelRef}
        finalFocus={openerRef}
      >
        <div className="flex items-start gap-3">
          {confirming && destructive ? (
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-foreground"
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {shownTitle}
            </DialogTitle>
            <DialogDescription
              render={<div />}
              className="flex flex-col gap-2 text-foreground"
            >
              {shownDescription}
            </DialogDescription>
          </div>
        </div>
        {confirming ? children : null}
        {confirming && typed !== undefined ? (
          <div className="flex flex-col gap-1">
            <TypeToConfirmField
              confirmText={typed.confirmText}
              prompt={typed.prompt}
              value={value}
              onValueChange={setValue}
            />
            <p id={hintId} className="text-sm text-muted-foreground">
              {typed.hint}
            </p>
          </div>
        ) : null}
        {confirming && error !== undefined ? (
          <div role="alert" className="flex flex-col gap-1 text-sm">
            {error}
          </div>
        ) : null}
        <p role="status" className="sr-only">
          {running ? runningLabel : ""}
        </p>
        <DialogFooter>
          <DialogClose
            ref={cancelRef}
            disabled={running}
            render={<Button variant="neutral" focusableWhenDisabled />}
          >
            {phase.kind === "refused" ? closeLabel : cancelLabel}
          </DialogClose>
          {confirming ? (
            <Button
              variant={destructive ? "destructive" : "primary"}
              loading={phase.rechecking === true || running}
              disabled={!matches}
              focusableWhenDisabled
              aria-describedby={
                matches || typed === undefined ? undefined : hintId
              }
              onClick={() => {
                if (matches && !busy) {
                  onConfirm();
                }
              }}
            >
              {phase.rechecking === true
                ? recheckingLabel
                : running
                  ? runningLabel
                  : confirmLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
