// SPDX-License-Identifier: GPL-3.0-or-later
// The form pattern's pieces (rethink spec 3.1 to 3.9), lab-local until the owner has seen them:
// development only (UI-11). Each is a candidate for the library (spec 8: FormLayout, FormSection,
// StatementRow, ChoiceCard, ToggleCard, MoreOptions, ConsequenceList, ErrorSummary, ActionBar, and
// the run's step list). Styling is forms.css; geometry reaches the CSS as custom properties through
// the CSSOM (UI-1).
import {
  Button,
  CopyButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FormColumn,
  LeavingItem,
  Switch,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormIconName } from "./FormIcon.tsx";
import { FormIcon } from "./FormIcon.tsx";
import type { Sentence } from "./model.ts";

// ─── Header and layout ────────────────────────────────────────────────────────────────────────

/**
 * The page's title and one sentence on what it makes. The page it belongs to is one link above the
 * title: a single level needs no trail and no separator glyph.
 */
export function FormHeader({
  title,
  line,
  parent,
}: {
  title: string;
  line: string;
  parent: string;
}) {
  return (
    <header className="lf-head">
      <nav aria-label="Breadcrumbs" className="lf-crumbs">
        <span className="lf-crumb-parent">{parent}</span>
      </nav>
      <div className="lf-head-words">
        <h1 className="lf-title">{title}</h1>
        <p className="lf-line">{line}</p>
      </div>
    </header>
  );
}

/**
 * Questions on the left at a readable measure, the outcome rail on the right, sticky (3.1). Under
 * the rail's width the rail's contents follow the questions and the action bar sticks to the bottom
 * of the viewport, with the page keeping its height so it never covers a focused control (3.7).
 */
export function FormLayout({
  layoutRef,
  wide,
  questions,
  rail,
  bar,
  busy,
}: {
  layoutRef: RefObject<HTMLDivElement | null>;
  wide: boolean;
  questions: ReactNode;
  rail: ReactNode;
  bar: ReactNode;
  busy: boolean;
}) {
  return (
    <div
      ref={layoutRef}
      className="lf-layout"
      data-wide={wide || undefined}
      data-busy={busy || undefined}
    >
      <FormColumn className="lf-questions">{questions}</FormColumn>
      <aside className="lf-rail" aria-label="What this does">
        <div className="lf-rail-inner">{rail}</div>
      </aside>
      {wide ? null : bar}
    </div>
  );
}

// ─── Questions ────────────────────────────────────────────────────────────────────────────────

/** One question (3.1), its words as the heading. No number: the order is not the content. */
export function FormSection({
  question,
  help,
  children,
  flagged,
}: {
  question: string;
  help?: ReactNode;
  children: ReactNode;
  flagged?: boolean;
}) {
  const id = useId();
  return (
    <section
      className="lf-section"
      aria-labelledby={id}
      data-flagged={flagged || undefined}
    >
      <div className="lf-section-head">
        <h2 id={id} className="lf-question">
          {question}
        </h2>
        {help}
      </div>
      <div className="lf-section-body">{children}</div>
    </section>
  );
}

/** A choice of one is a statement, not a radio (3.3). "Change" only when there is something to change to. */
export function StatementRow({
  icon,
  children,
  fact,
}: {
  icon: FormIconName;
  children: ReactNode;
  fact?: ReactNode;
}) {
  return (
    <p className="lf-statement">
      <span className="lf-statement-icon" aria-hidden="true">
        <FormIcon name={icon} size={20} />
      </span>
      <span className="lf-statement-words">{children}</span>
      {fact ? <span className="lf-statement-fact">{fact}</span> : null}
    </p>
  );
}

export interface ChoiceOption<V extends string> {
  value: V;
  title: string;
  line: string;
  /** A fact in tabular figures: "412 GiB free of 931 GiB". */
  fact?: ReactNode;
  /** A usage bar under the fact, 0 to 1. */
  used?: number;
  /** The technical term, in secondary text after the title (N5): "EXT4". */
  term?: string;
  recommended?: boolean;
  /** Kept visible, not choosable; the reason replaces the line (3.6). */
  unavailable?: string;
}

/**
 * A choice of a few (3.6): a radio list, one option per row with its radio at the start, so arrows
 * move between them and nothing is built by hand. Not a row of same-shaped tiles: the options read
 * down like a list. Selected is the selection ground, never the accent.
 */
export function ChoiceCards<V extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: V;
  options: readonly ChoiceOption<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <fieldset className="lf-cards">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className="lf-card"
            data-checked={checked || undefined}
            data-unavailable={option.unavailable ? true : undefined}
          >
            <input
              type="radio"
              className="lf-card-input"
              name={name}
              value={option.value}
              checked={checked}
              disabled={Boolean(option.unavailable)}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span className="lf-card-dot" aria-hidden="true" />
            <span className="lf-card-title">
              {option.title}
              {option.term ? (
                <span className="lf-term"> {option.term}</span>
              ) : null}
            </span>
            <span className="lf-card-line">
              {option.unavailable ?? option.line}
            </span>
            {option.fact ? (
              <span className="lf-card-fact">{option.fact}</span>
            ) : null}
            {option.used !== undefined && !option.unavailable ? (
              <span className="lf-card-bar" aria-hidden="true">
                <span
                  className="lf-card-bar-fill"
                  style={{ "--v": option.used } as CSSProperties}
                />
              </span>
            ) : null}
            {option.recommended ? (
              <span className="lf-recommended">Recommended</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * A way in, on or off (3.11 question 4): a row with the way's icon and name, and a switch whose
 * position and word say the state, not colour alone. A real checkbox with the switch role, so it is
 * named by its row and toggled by Space.
 */
export function ToggleCard({
  icon,
  title,
  term,
  line,
  checked,
  onChange,
  children,
}: {
  icon: FormIconName;
  title: string;
  term: string;
  line: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="lf-toggle" data-checked={checked || undefined}>
      <label className="lf-toggle-label" htmlFor={id}>
        <span className="lf-card-icon" aria-hidden="true">
          <FormIcon name={icon} size={24} />
        </span>
        <span className="lf-card-title">
          {title}
          <span className="lf-term"> {term}</span>
        </span>
        <span className="lf-card-line">{line}</span>
        <span className="lf-toggle-state" aria-hidden="true">
          <span className="lf-toggle-track">
            <span className="lf-toggle-thumb" />
          </span>
          {checked ? "On" : "Off"}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="lf-card-input"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
      </label>
      {children ? <div className="lf-toggle-more">{children}</div> : null}
    </div>
  );
}

/**
 * Pro options for one question, named for what is inside (3.5), saying when it hides a change. The
 * count glides: the old number leaves upward as the new one arrives.
 */
export function MoreOptions({
  what,
  changed,
  open,
  onOpenChange,
  children,
}: {
  what: string;
  changed: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Disclosure open={open} onOpenChange={onOpenChange} className="lf-more">
      <DisclosureTrigger>
        More options: {what}
        {changed > 0 ? (
          <span className="lf-more-changed">
            {", "}
            <span key={changed} className="lf-count">
              {changed}
            </span>{" "}
            changed
          </span>
        ) : null}
      </DisclosureTrigger>
      <DisclosurePanel>
        <div className="lf-more-body">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}

/**
 * Help on demand (G3, P.3): with tips on, a question-named disclosure; with tips off, the same
 * content behind a (?) icon with the same name, so the section is a line shorter.
 */
export function Help({
  tips,
  question,
  children,
}: {
  tips: boolean;
  question: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (tips) {
    return (
      <Disclosure open={open} onOpenChange={setOpen} className="lf-help">
        <DisclosureTrigger variant="inline">{question}</DisclosureTrigger>
        <DisclosurePanel>
          <div className="lf-help-body">{children}</div>
        </DisclosurePanel>
      </Disclosure>
    );
  }
  return (
    <span className="lf-help-q">
      <button
        type="button"
        className="lf-help-icon"
        aria-label={question}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <FormIcon name="help" />
      </button>
      <span id={panelId} hidden={!open} className="lf-help-pop">
        {children}
      </span>
    </span>
  );
}

/** A one-line first-time tip (G2), dismissible; never shown with tips off. */
export function Tip({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <p className="lf-tip">
      <FormIcon name="tip" className="lf-tip-icon" />
      <span className="lf-tip-words">{children}</span>
      <button type="button" className="lf-tip-close" onClick={onDismiss}>
        Got it
      </button>
    </p>
  );
}

// ─── The rail ─────────────────────────────────────────────────────────────────────────────────

const SENTENCE_ICON: Record<Sentence["icon"], FormIconName> = {
  made: "create-shared-folder",
  people: "group",
  smb: "smb",
  nfs: "nfs",
  nas: "info",
  warning: "warning",
  effect: "takes-effect",
};

function SentenceWords({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={`b${String(i)}:${part}`} className="lf-strong">
            {part}
          </strong>
        ) : (
          <span key={`p${String(i)}:${part}`}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * The live consequence summary (3.7): one fact per sentence, generated from the answers. What is
 * there when the page opens is simply there. Afterwards, in answer to the person: a new sentence
 * fades in, a removed one leaves and gives up its height, a changed one crossfades its words (7.4
 * "A summary sentence changes").
 */
export function ConsequenceList({
  sentences,
  iconFor = SENTENCE_ICON,
}: {
  sentences: Sentence[];
  iconFor?: Record<Sentence["icon"], FormIconName>;
}) {
  const { entries, left } = useLeavingItems(sentences, (s) => s.id);
  // The sentences and their words as the page opened with them: those never animate in.
  const [opened] = useState(
    () =>
      new Set(sentences.flatMap((s) => [s.id, `${s.id}|${s.parts.join("")}`])),
  );
  return (
    <ul className="lf-sum" aria-label="What pressing the button does">
      {entries.map(({ key, item, leaving }) => (
        <LeavingItem
          key={key}
          leaving={leaving}
          onLeft={() => {
            left(key);
          }}
          className={opened.has(key) ? "lf-sum-item" : "lf-sum-item lf-arrive"}
          data-tone={item.tone}
        >
          <div className="lf-sum-row">
            <span className="lf-sum-icon" aria-hidden="true">
              <FormIcon name={iconFor[item.icon]} />
            </span>
            <span
              key={item.parts.join("")}
              className={
                opened.has(`${item.id}|${item.parts.join("")}`)
                  ? "lf-sum-words"
                  : "lf-sum-words lf-fade"
              }
            >
              <SentenceWords parts={item.parts} />
            </span>
            {item.copy ? (
              <CopyButton
                text={item.copy.text}
                label={item.copy.label}
                copiedLabel="Copied"
                selectedLabel="Selected. Press Ctrl+C to copy."
                size="icon-sm"
                className="lf-sum-copy"
              />
            ) : null}
          </div>
        </LeavingItem>
      ))}
    </ul>
  );
}

/**
 * The error summary (3.8): shown after a press of the primary finds problems, focused once, one
 * link per problem that moves focus to its field.
 */
export function ErrorSummary({
  problems,
  attempt,
  onGo,
}: {
  problems: { field: string; text: string }[];
  /** Each press of the primary: the summary is focused again. */
  attempt: number;
  onGo: (field: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (attempt > 0) {
      ref.current?.focus();
    }
  }, [attempt]);
  if (problems.length === 0) {
    return null;
  }
  return (
    <div
      key={attempt}
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="lf-errors"
    >
      <p className="lf-errors-title">
        <FormIcon name="error" />
        {problems.length === 1
          ? "There is 1 thing to fix."
          : `There are ${problems.length} things to fix.`}
      </p>
      <ul className="lf-errors-list">
        {problems.map((p) => (
          <li key={p.field}>
            <button
              type="button"
              className="lf-errors-link"
              onClick={() => {
                onGo(p.field);
              }}
            >
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The primary with its keyboard shortcut shown in it (A7), and Cancel as a text button. */
export function ActionBar({
  primary,
  onPrimary,
  onCancel,
  disabled,
  narrow,
}: {
  primary: string;
  onPrimary: () => void;
  onCancel: () => void;
  disabled?: boolean;
  narrow?: { first: ReactNode; onReview: () => void };
}) {
  const mac =
    typeof navigator !== "undefined" && /Mac/u.test(navigator.platform);
  const buttons = (
    <div className="lf-actions">
      <Button
        variant="primary"
        size="lg"
        className="lf-primary"
        onClick={onPrimary}
        disabled={disabled}
        aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"}
      >
        <span className="lf-primary-words">{primary}</span>
        <kbd className="lf-kbd" aria-hidden="true">
          {mac ? "⌘ Enter" : "Ctrl Enter"}
        </kbd>
      </Button>
      <Button variant="ghost" size="lg" onClick={onCancel} disabled={disabled}>
        Cancel
      </Button>
    </div>
  );
  if (!narrow) {
    return buttons;
  }
  return (
    <div className="lf-bar" role="region" aria-label="Create">
      <div className="lf-bar-inner">
        <p className="lf-bar-first">{narrow.first}</p>
        <button
          type="button"
          className="lf-bar-review"
          onClick={narrow.onReview}
        >
          Review
        </button>
        {buttons}
      </div>
    </div>
  );
}

// ─── The run and its end ──────────────────────────────────────────────────────────────────────

export type StepState = "waiting" | "running" | "done" | "failed";

export interface RunStep {
  id: string;
  label: string;
  state: StepState;
}

const STEP_WORD: Record<StepState, string> = {
  waiting: "Waiting",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

/**
 * The run in place of the summary (3.9, 7.4 "The run"), a checklist rather than a numbered
 * stepper: a step still to come is an empty circle; the step in progress has a ring that fills over
 * the step's expected time; a finished step is OK's check, drawn as it lands; a failed one is the
 * critical cross. Every state also has its word.
 */
export function RunSteps({
  steps,
  stepMs,
}: {
  steps: RunStep[];
  stepMs: number;
}) {
  return (
    <ol
      className="lf-run"
      aria-label="Steps"
      style={{ "--step-ms": `${stepMs}ms` } as CSSProperties}
    >
      {steps.map((step) => (
        <li
          key={step.id}
          className="lf-run-step"
          data-state={step.state}
          aria-current={step.state === "running" ? "step" : undefined}
        >
          <span className="lf-run-disc" aria-hidden="true">
            <svg viewBox="0 0 32 32" className="lf-run-svg">
              <circle className="lf-run-face" cx="16" cy="16" r="11.5" />
              <circle
                className="lf-run-ring"
                cx="16"
                cy="16"
                r="15"
                pathLength={1}
              />
              {step.state === "done" ? (
                <path
                  className="lf-run-check"
                  d="m11 16.5 3.5 3.5 6.5-7.5"
                  pathLength={1}
                />
              ) : null}
              {step.state === "failed" ? (
                <path className="lf-run-cross" d="m12 12 8 8M20 12l-8 8" />
              ) : null}
            </svg>
          </span>
          <span className="lf-run-label">{step.label}</span>
          <span className="lf-run-word">{STEP_WORD[step.state]}</span>
        </li>
      ))}
      <li className="sr-only" role="status">
        {steps
          .filter((s) => s.state !== "waiting")
          .map((s) => `${s.label}: ${STEP_WORD[s.state]}`)
          .at(-1)}
      </li>
    </ol>
  );
}

export function Address({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="lf-address">
      <span className="lf-address-label">{label}</span>
      <code className="lf-address-value">{value}</code>
      <CopyButton
        text={value}
        label={copyLabel}
        copiedLabel="Copied"
        selectedLabel="Selected. Press Ctrl+C to copy."
        size="icon-sm"
      />
    </div>
  );
}

/** A rarely set option as a settings row: the words on the left, the switch on the right. */
export function SettingRow({
  label,
  hint,
  checked,
  onChange,
  warn,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Its consequence when on, with the warning shape (3.5: nothing that can surprise is hidden). */
  warn?: string;
}) {
  const id = useId();
  return (
    <div className="lf-setting" data-warn={warn ? true : undefined}>
      <div className="lf-setting-words">
        <label htmlFor={id} className="lf-setting-label">
          {label}
        </label>
        <p id={`${id}-hint`} className="lf-setting-hint">
          {hint}
        </p>
        {warn ? (
          <p className="lf-setting-warn lf-arrive">
            <FormIcon name="warning" />
            {warn}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * The full summary on a narrow screen (3.7: "Review opens the full summary as a sheet"), the same
 * way on every form: the picture, the sentences and the action bar, in a dialog.
 */
export function ReviewSheet({
  open,
  onOpenChange,
  picture,
  sentences,
  iconFor,
  primary,
  onPrimary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picture: ReactNode;
  sentences: Sentence[];
  iconFor?: Record<Sentence["icon"], FormIconName>;
  primary: string;
  onPrimary: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lf-sheet">
        <DialogHeader>
          <DialogTitle>What this does</DialogTitle>
        </DialogHeader>
        {picture}
        <ConsequenceList sentences={sentences} iconFor={iconFor} />
        <ActionBar
          primary={primary}
          onPrimary={() => {
            onOpenChange(false);
            onPrimary();
          }}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
