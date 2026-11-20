// SPDX-License-Identifier: GPL-3.0-or-later
import { History, OctagonX } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { StatusPill } from "../status/status";
import type { TaskStatus } from "../status/status-kinds";

// Presentational parts of the job runner (UX audit 4.1, R1-R10). They hold no flow logic: the app
// decides which part shows and wires the calls. Every word comes in through props.

/** A job: a heading and its parts, in reading order. */
function JobRunner({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { title: React.ReactNode }) {
  return (
    <section
      data-slot="job-runner"
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-surface p-4",
        className,
      )}
      {...props}
    >
      <h2 className="text-lg leading-tight font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface JobStep {
  id: string;
  /** What the step does, in plain words: "Create the file system on /dev/sdb". */
  label: React.ReactNode;
  status: TaskStatus;
  /** Below the label: for a failed step the backend's message, as text (UI-9); output for a running one. */
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
 * and what did not run are all visible after a failure (R6).
 */
function JobStepList({
  steps,
  statusLabels,
  label,
  className,
}: JobStepListProps) {
  return (
    <ol
      data-slot="job-step-list"
      aria-label={label}
      className={cn("flex flex-col", className)}
    >
      {steps.map((step) => (
        <li
          key={step.id}
          data-status={step.status}
          aria-current={step.status === "running" ? "step" : undefined}
          className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0"
        >
          <div className="flex items-center gap-3">
            <StatusPill status={step.status} className="w-28 shrink-0">
              {statusLabels[step.status]}
            </StatusPill>
            <span
              className={cn(
                "min-w-0 text-base",
                step.status === "waiting" || step.status === "cancelled"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {step.detail ? (
            <div className="ms-31 text-sm whitespace-pre-wrap text-foreground">
              {step.detail}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

interface PreflightNoticeProps {
  /** "Some changes are not applied yet". */
  title: React.ReactNode;
  /** What is pending, in words, and why it matters before this job starts (R1). */
  children: React.ReactNode;
  applyLabel: React.ReactNode;
  undoLabel: React.ReactNode;
  onApply: () => void;
  onUndo: () => void;
  /** Applying or undoing is running: both controls are unavailable. */
  busy?: boolean;
  className?: string;
}

/**
 * The pre-flight notice (R1): before the first decision, pending changes from elsewhere are named and
 * the reader applies or undoes them, so the job's own apply carries nothing else.
 */
function PreflightNotice({
  title,
  children,
  applyLabel,
  undoLabel,
  onApply,
  onUndo,
  busy = false,
  className,
}: PreflightNoticeProps) {
  return (
    <div
      data-slot="preflight-notice"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-pending-stroke bg-surface p-4",
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
      <div className="text-base text-foreground">{children}</div>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={onApply}>
          {applyLabel}
        </Button>
        <Button
          variant="neutral"
          disabled={busy}
          focusableWhenDisabled
          onClick={onUndo}
        >
          {undoLabel}
        </Button>
      </div>
    </div>
  );
}

/** The line that names changes pending from outside this job, in its apply confirmation (R10). */
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

interface JobSummaryProps {
  /** "Ready to add the disk and share it". */
  title: React.ReactNode;
  /** Every choice made, in plain words, one item each (R2). */
  items: readonly React.ReactNode[];
  /** The R10 line, an `AlsoPendingNotice`, when other changes would be applied too. */
  alsoPending?: React.ReactNode;
  confirmLabel: React.ReactNode;
  backLabel: React.ReactNode;
  onConfirm: () => void;
  onBack: () => void;
  /**
   * The job erases data: the confirm control is red. It should open the typed confirmation (UI-8),
   * not run the job directly.
   */
  destructive?: boolean;
  className?: string;
}

/** Decide, then summarise, then run (R2): one summary in plain words and one confirmation. */
function JobSummary({
  title,
  items,
  alsoPending,
  confirmLabel,
  backLabel,
  onConfirm,
  onBack,
  destructive = false,
  className,
}: JobSummaryProps) {
  return (
    <div
      data-slot="job-summary"
      className={cn("flex flex-col gap-3", className)}
    >
      <p className="font-semibold text-foreground">{title}</p>
      <ul className="flex list-disc flex-col gap-1 ps-5 text-base text-foreground marker:text-muted-foreground">
        {items.map((item, position) => (
          <li key={`item-${String(position)}`}>{item}</li>
        ))}
      </ul>
      {alsoPending}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="neutral" onClick={onBack}>
          {backLabel}
        </Button>
        <Button
          variant={destructive ? "destructive" : "primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

interface JobFailureProps {
  /** "Creating the file system failed" or "Applying the changes failed". */
  title: React.ReactNode;
  /** The backend's message, as text (UI-9). */
  message: React.ReactNode;
  /** "Try this step again" (R6), or "Try applying again" after a failed apply (R7). */
  retryLabel: React.ReactNode;
  onRetry: () => void;
  /**
   * The undo offer, only when undoing is safe: "Undo the changes not applied yet" (R6) or the revert
   * after a failed apply (R7). Omit it when no undo may be offered. Nothing retries by itself (UI-14).
   */
  undo?: { label: React.ReactNode; onUndo: () => void };
  /** The retry or undo is running. */
  busy?: boolean;
  className?: string;
}

/** A step stopped the job (R6, R7): what failed, in the backend's words, and what can be done. */
function JobFailure({
  title,
  message,
  retryLabel,
  onRetry,
  undo,
  busy = false,
  className,
}: JobFailureProps) {
  return (
    <div
      data-slot="job-failure"
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-critical-stroke bg-surface p-4",
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
      <p className="text-base whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={onRetry}>
          {retryLabel}
        </Button>
        {undo ? (
          <Button
            variant="neutral"
            disabled={busy}
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
  JobFailure,
  JobRunner,
  JobStepList,
  JobSummary,
  PreflightNotice,
};
export type {
  JobFailureProps,
  JobStep,
  JobStepListProps,
  JobSummaryProps,
  PreflightNoticeProps,
};
