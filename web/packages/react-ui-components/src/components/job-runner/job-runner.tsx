// SPDX-License-Identifier: GPL-3.0-or-later
import { History, OctagonX, TriangleAlert, X } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button, IconButton } from "../button/button";
import { buttonRowClass } from "../button/button-class";
import { ProgressBar } from "../progress-bar/progress-bar";
import { StatusLabel } from "../status/status";
import type { TaskStatus } from "../status/status-kinds";
import { ServerMessage } from "../text/server-message";
import { TypeToConfirmField } from "../type-to-confirm/type-to-confirm-field";
import { typedMatches } from "../type-to-confirm/typed-matches";

// Presentational parts of the job runner (UX audit 4.1, R1-R10). They hold no flow logic: the app
// decides which part shows and wires the calls. Every word comes in through props.

type HeadingLevel = 2 | 3 | 4;
const HEADINGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/** A job: a heading at the level the page needs, and its parts in reading order. */
function JobRunner({
  title,
  headingLevel = 2,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  title: React.ReactNode;
  /** The heading's level in the page outline; the job's own title is usually the page's h2. */
  headingLevel?: HeadingLevel;
}) {
  const Heading = HEADINGS[headingLevel];
  return (
    <section
      data-slot="job-runner"
      className={cn(
        "flex flex-col gap-4 rounded-card surface-raised p-card",
        className,
      )}
      {...props}
    >
      <Heading className="text-section text-foreground">{title}</Heading>
      {children}
    </section>
  );
}

interface JobStep {
  id: string;
  /** What the step does, in plain words: "Create the file system on /dev/sdb". */
  label: React.ReactNode;
  /** Steps that never ran, before the job started or after a failure, stay `waiting` (owner, 2026-11-20). */
  status: TaskStatus;
  /** Below the label: output for a running step. */
  detail?: React.ReactNode;
}

interface JobStepListProps {
  steps: readonly JobStep[];
  /** The word for each state, from the catalogue: Waiting, Running, Succeeded, Failed, Cancelled. */
  statusLabels: Record<TaskStatus, string>;
  /** The list's name: "Steps". */
  label: string;
  className?: string;
}

/**
 * The step list (R5): each step with its state as a word and an icon, so what succeeded, what failed
 * and what did not run are all visible after a failure (R6). A step that changes state is announced
 * through a polite live region that is present from the first render. Under 640px the state sits above
 * the step; from there the states form one aligned column (subgrid).
 */
function JobStepList({
  steps,
  statusLabels,
  label,
  className,
}: JobStepListProps) {
  // The last step whose state changed since the previous render, kept in state during render (no
  // effect), so the announcement and the change land in the same frame.
  const [previous, setPrevious] = React.useState(steps);
  const [announced, setAnnounced] = React.useState<JobStep | undefined>();
  if (steps !== previous) {
    const before = new Map(previous.map((step) => [step.id, step.status]));
    const changed = steps.filter((step) => before.get(step.id) !== step.status);
    setPrevious(steps);
    if (changed.length > 0) {
      setAnnounced(changed[changed.length - 1]);
    }
  }
  return (
    <div data-slot="job-steps" className={className}>
      <ol
        data-slot="job-step-list"
        aria-label={label}
        className="grid sm:grid-cols-[max-content_1fr]"
      >
        {steps.map((step) => (
          <li
            key={step.id}
            data-status={step.status}
            aria-current={step.status === "running" ? "step" : undefined}
            className="grid gap-1.5 border-t border-border py-2.5 first:border-t-0 sm:col-span-2 sm:grid-cols-subgrid sm:items-center sm:gap-x-3"
          >
            <StatusLabel
              status={step.status}
              className="justify-self-start sm:min-w-28"
            >
              {statusLabels[step.status]}
            </StatusLabel>
            <span
              className={cn(
                "min-w-0 text-base [overflow-wrap:anywhere]",
                step.status === "waiting" || step.status === "cancelled"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {step.label}
            </span>
            {step.detail ? (
              <div className="min-w-0 text-sm text-foreground sm:col-start-2">
                {step.detail}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <span role="status" data-slot="job-step-announcer" className="sr-only">
        {announced ? (
          <>
            <span>{announced.label}</span>{" "}
            <span>{statusLabels[announced.status]}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

interface JobProgressProps {
  /** What is running now, in words: "Creating the file system on /dev/sdb". */
  label: React.ReactNode;
  /** How long it has run, formatted by the caller with its words: "Elapsed: 2 min 15 s". */
  elapsed: React.ReactNode;
  /**
   * Known progress: `value` out of `max`, with the numbers in words for the bar's text alternative.
   * `value: null` draws an indeterminate bar. Omit when the task reports no progress at all.
   */
  progress?: { value: number | null; max?: number; valueText: string };
  /** Offered only where cancelling is safe (5.7): "Cancel the scrub". */
  cancel?: { label: React.ReactNode; onCancel: () => void; busy?: boolean };
  className?: string;
}

/** The running step (5.7, R5): what runs, for how long, how far along, and a cancel where safe. */
function JobProgress({
  label,
  elapsed,
  progress,
  cancel,
  className,
}: JobProgressProps) {
  return (
    <div
      data-slot="job-progress"
      className={cn("flex flex-col gap-2", className)}
    >
      {progress ? (
        <ProgressBar
          label={label}
          value={progress.value}
          max={progress.max}
          valueText={progress.valueText}
        />
      ) : (
        <p className="text-base font-medium text-foreground">{label}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">{elapsed}</p>
        {cancel ? (
          <Button
            variant="neutral"
            size="sm"
            loading={cancel.busy}
            onClick={cancel.onCancel}
          >
            {cancel.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface JobResultProps {
  /**
   * How the job ended, once it has: the fixed word as a status label and a plain sentence. While undefined the
   * component still renders its (empty) live region, so the result is announced when it arrives.
   */
  result?: {
    status: "succeeded" | "failed" | "cancelled";
    /** Succeeded, Failed or Cancelled, from the catalogue. */
    statusLabel: string;
    message: React.ReactNode;
  };
  /** The dismiss control's name: "Dismiss the result". The result stays until it is pressed (5.7). */
  dismissLabel: string;
  onDismiss: () => void;
  className?: string;
}

/**
 * How the job ended (5.7): announced through a polite live region that exists from the first render,
 * and kept on screen until dismissed.
 */
function JobResult({
  result,
  dismissLabel,
  onDismiss,
  className,
}: JobResultProps) {
  return (
    <div
      data-slot="job-result"
      role="status"
      aria-live="polite"
      className={cn(result && "rounded-card surface-raised p-card", className)}
    >
      {result ? (
        <div className="flex items-start gap-3">
          <StatusLabel status={result.status} className="mt-0.5">
            {result.statusLabel}
          </StatusLabel>
          <p className="min-w-0 flex-1 text-base text-foreground">
            {result.message}
          </p>
          <IconButton
            label={dismissLabel}
            icon={<X />}
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onDismiss}
          />
        </div>
      ) : null}
    </div>
  );
}

interface PendingDecisionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  primaryLabel: React.ReactNode;
  secondaryLabel: React.ReactNode;
  onPrimary: () => void;
  onSecondary: () => void;
  busy?: "primary" | "secondary";
  slot: string;
  className?: string;
}

// The shape shared by the pre-flight notice and the pause before the final apply: a pending-marked
// panel on a neutral surface (only audited pairs), a plain explanation and two decisions.
function PendingDecision({
  title,
  children,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  busy,
  slot,
  className,
}: PendingDecisionProps) {
  return (
    <div
      data-slot={slot}
      className={cn(
        // Waiting on a decision about pending changes: the pending wash with its stroke edge.
        "flex flex-col gap-3 rounded-card border border-pending-stroke bg-pending-wash p-card",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-semibold text-pending-label">
        <History
          aria-hidden="true"
          className="size-4 shrink-0 text-pending-stroke"
        />
        {title}
      </p>
      <div className="flex flex-col gap-2 text-base text-foreground">
        {children}
      </div>
      <div className={buttonRowClass}>
        <Button
          loading={busy === "primary"}
          disabled={busy === "secondary"}
          focusableWhenDisabled
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
        <Button
          variant="neutral"
          loading={busy === "secondary"}
          disabled={busy === "primary"}
          focusableWhenDisabled
          onClick={onSecondary}
        >
          {secondaryLabel}
        </Button>
      </div>
    </div>
  );
}

interface PreflightNoticeProps {
  /** "Some changes are not applied yet". */
  title: React.ReactNode;
  /** What is pending, in words, and why it matters before this job starts (R1). */
  children: React.ReactNode;
  /** "Apply them now". */
  applyLabel: React.ReactNode;
  /** "Undo them". */
  undoLabel: React.ReactNode;
  onApply: () => void;
  onUndo: () => void;
  /** Which of the two is running: that button shows it, the other is unavailable. */
  busy?: "apply" | "undo";
  className?: string;
}

/**
 * The pre-flight notice (R1): before the first decision, pending changes from elsewhere are named and
 * the reader applies or undoes them, so the job's own apply carries nothing else.
 */
function PreflightNotice({
  applyLabel,
  undoLabel,
  onApply,
  onUndo,
  busy,
  ...props
}: PreflightNoticeProps) {
  return (
    <PendingDecision
      {...props}
      slot="preflight-notice"
      primaryLabel={applyLabel}
      secondaryLabel={undoLabel}
      onPrimary={onApply}
      onSecondary={onUndo}
      busy={
        busy === "apply" ? "primary" : busy === "undo" ? "secondary" : undefined
      }
    />
  );
}

interface AlsoPendingPromptProps {
  /** "Other changes are pending too". */
  title: React.ReactNode;
  /** The `AlsoPendingNotice` line and what applying them means. */
  children: React.ReactNode;
  /** "Apply them too". */
  applyLabel: React.ReactNode;
  /** "Stop here". */
  stopLabel: React.ReactNode;
  onApply: () => void;
  onStop: () => void;
  /** Which of the two is running. */
  busy?: "apply" | "stop";
  className?: string;
}

/**
 * The pause before the final apply (R10): modules outside the job's own set became pending while it
 * ran. The job stops and asks whether to apply those too or stop here.
 */
function AlsoPendingPrompt({
  applyLabel,
  stopLabel,
  onApply,
  onStop,
  busy,
  ...props
}: AlsoPendingPromptProps) {
  return (
    <PendingDecision
      {...props}
      slot="also-pending-prompt"
      primaryLabel={applyLabel}
      secondaryLabel={stopLabel}
      onPrimary={onApply}
      onSecondary={onStop}
      busy={
        busy === "apply" ? "primary" : busy === "stop" ? "secondary" : undefined
      }
    />
  );
}

/** The line that names changes pending from outside this job: "Also pending from elsewhere: NFS" (R10). */
function AlsoPendingNotice({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="also-pending"
      className={cn(
        "flex items-start gap-2 text-base font-medium text-pending-label",
        className,
      )}
      {...props}
    >
      <History
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-pending-stroke"
      />
      <span>{children}</span>
    </p>
  );
}

/**
 * A summary item that carries the warning shape in place of its bullet: a risk the reader chose
 * ("Anyone on your network can open it without a password."). The shape is drawn in the neutral ink,
 * never a status colour, since nothing has failed; the words carry the meaning.
 */
interface JobSummaryNotedItem {
  content: React.ReactNode;
  tone: "warning";
}

type JobSummaryItem = React.ReactNode | JobSummaryNotedItem;

function isNotedItem(item: JobSummaryItem): item is JobSummaryNotedItem {
  return (
    typeof item === "object" &&
    item !== null &&
    !React.isValidElement(item) &&
    "tone" in item &&
    "content" in item
  );
}

interface JobSummaryProps {
  /** "Ready to add the disk and share it". */
  title: React.ReactNode;
  /**
   * Every choice made, in plain words, one item each (R2). An item is its words, or
   * `{ content, tone: "warning" }` for one that carries the warning shape.
   */
  items: readonly JobSummaryItem[];
  confirmLabel: React.ReactNode;
  backLabel: React.ReactNode;
  onConfirm: () => void;
  onBack: () => void;
  /**
   * The job erases data (UI-8): the typed confirmation sits in the summary itself, and the confirm
   * button is red and unavailable until the name matches. One confirmation, not a dialog on top (R2).
   */
  typedConfirmation?: { confirmText: string; prompt: string };
  /**
   * A warning that must stand apart from the list and be read before the typed field: "This array
   * has no protection" as an `InlineAlert`. Rendered after the items and before the typed confirmation.
   */
  notice?: React.ReactNode;
  /**
   * Draw the title as a heading at this level in the page outline, with the same look, so the page
   * can move focus to it on arrival (it carries `tabIndex={-1}`). Omitted, the title is a paragraph.
   */
  titleLevel?: HeadingLevel;
  /** The title heading, for the page to focus on arrival. Used only with `titleLevel`. */
  titleRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
}

/** Decide, then summarise, then run (R2): one summary in plain words and one confirmation. */
function JobSummary({
  title,
  items,
  confirmLabel,
  backLabel,
  onConfirm,
  onBack,
  typedConfirmation,
  notice,
  titleLevel,
  titleRef,
  className,
}: JobSummaryProps) {
  const [typed, setTyped] = React.useState("");
  const TitleHeading =
    titleLevel === undefined ? undefined : HEADINGS[titleLevel];
  const ready =
    typedConfirmation === undefined ||
    typedMatches(typed, typedConfirmation.confirmText);
  return (
    <div
      data-slot="job-summary"
      className={cn("flex flex-col gap-3", className)}
    >
      {TitleHeading ? (
        <TitleHeading
          ref={titleRef}
          tabIndex={-1}
          className="font-semibold text-foreground outline-hidden"
        >
          {title}
        </TitleHeading>
      ) : (
        <p className="font-semibold text-foreground">{title}</p>
      )}
      <ul className="flex list-disc flex-col gap-1 ps-5 text-base text-foreground marker:text-muted-foreground">
        {items.map((item, position) =>
          isNotedItem(item) ? (
            <li
              key={`item-${String(position)}`}
              data-tone={item.tone}
              className="relative list-none"
            >
              <TriangleAlert
                aria-hidden="true"
                className="absolute -start-5 top-[calc((1lh-1rem)/2)] size-4 text-muted-foreground"
              />
              {item.content}
            </li>
          ) : (
            <li key={`item-${String(position)}`}>{item}</li>
          ),
        )}
      </ul>
      {notice}
      {typedConfirmation ? (
        <TypeToConfirmField
          confirmText={typedConfirmation.confirmText}
          prompt={typedConfirmation.prompt}
          value={typed}
          onValueChange={setTyped}
        />
      ) : null}
      <div className={cn("sm:justify-end", buttonRowClass)}>
        <Button variant="neutral" onClick={onBack}>
          {backLabel}
        </Button>
        <Button
          variant={typedConfirmation ? "destructive" : "primary"}
          disabled={!ready}
          focusableWhenDisabled
          onClick={() => {
            if (ready) {
              onConfirm();
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

interface JobFailureProps {
  /** "Mounting the file system failed" or "Applying the changes failed". */
  title: React.ReactNode;
  /** One plain sentence first: what this means and what can be done. */
  message: React.ReactNode;
  /** The backend's own words, second, labelled as from the server (UI-9). */
  serverMessage?: { label: React.ReactNode; text: string };
  /** How many steps did not run: "3 steps did not run." They stay Waiting in the list. */
  notRun?: React.ReactNode;
  /** "Try this step again" (R6), or "Try applying again" after a failed apply (R7). */
  retryLabel: React.ReactNode;
  onRetry: () => void;
  /**
   * The undo offer, only when undoing is safe: "Undo the changes not applied yet" (R6) or the undo
   * after a failed apply (R7). Omit it when no undo may be offered. Nothing retries by itself (UI-14).
   */
  undo?: { label: React.ReactNode; onUndo: () => void };
  /** Which of the two is running: that button shows it, the other is unavailable. */
  busy?: "retry" | "undo";
  className?: string;
}

/** A step stopped the job (R6, R7): what failed in plain words, the server's words, what is next. */
function JobFailure({
  title,
  message,
  serverMessage,
  notRun,
  retryLabel,
  onRetry,
  undo,
  busy,
  className,
}: JobFailureProps) {
  return (
    <div
      data-slot="job-failure"
      role="alert"
      className={cn(
        // The job failed: the one element in that state takes its wash (foundation 3.3).
        "flex flex-col gap-3 rounded-card border border-critical-stroke bg-critical-wash p-card",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-semibold text-critical-label">
        <OctagonX
          aria-hidden="true"
          className="size-4 shrink-0 text-critical-stroke"
        />
        {title}
      </p>
      <p className="text-base text-foreground">{message}</p>
      {notRun ? (
        <p className="text-base text-muted-foreground">{notRun}</p>
      ) : null}
      {serverMessage ? (
        <ServerMessage label={serverMessage.label}>
          {serverMessage.text}
        </ServerMessage>
      ) : null}
      <div className={buttonRowClass}>
        <Button
          loading={busy === "retry"}
          disabled={busy === "undo"}
          focusableWhenDisabled
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
        {undo ? (
          <Button
            variant="neutral"
            loading={busy === "undo"}
            disabled={busy === "retry"}
            focusableWhenDisabled
            onClick={undo.onUndo}
          >
            {undo.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  JobFailure,
  JobProgress,
  JobResult,
  JobRunner,
  JobStepList,
  JobSummary,
  PreflightNotice,
};
export type {
  AlsoPendingPromptProps,
  HeadingLevel,
  JobFailureProps,
  JobProgressProps,
  JobResultProps,
  JobStep,
  JobStepListProps,
  JobSummaryItem,
  JobSummaryNotedItem,
  JobSummaryProps,
  PreflightNoticeProps,
};
