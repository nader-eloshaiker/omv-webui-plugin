// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's forms (rethink 7.4): the lineage strip drawing as the form fills, a group's access
// fanning out, the summary's sentences changing, a choice card picked, More options, password
// strength and suggestion, errors on submit, the run, "it is live", the save settle with the
// pending flight, and the impact line sharpening. The forms lab's own pictures and fixtures.
// Development only (UI-11).
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  flyPendingMark,
  ImpactLine,
  LeavingItem,
  popElement,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import { Check, Copy, Monitor, Server } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { FolderPicture, PersonPicture } from "../../forms/LineageStrip.tsx";
import type { Access } from "../../forms/model.ts";
import { drawPath } from "../helpers/drawPath.ts";
import { useFirstTime } from "../helpers/useFirstTime.ts";
import { useReducedMotion } from "../helpers/useReducedMotion.ts";
import { Crossfade, DrawnCheck, RollingNumber, StageNote } from "../parts.tsx";
import { useDraw, useStill } from "../stage.ts";
import type { StageProps } from "../types.ts";

/** A value that changed since the stage was drawn: only a change is news (7.1 rule 1). */
function useChangedSinceMount<T>(value: T): boolean {
  const [initial] = useState(value);
  return value !== initial;
}

// ─── The path draws as you fill ───────────────────────────────────────────────────────────────

export interface PathState {
  name: string;
  drive: boolean;
  smb: boolean;
}

export function PathStage({ state }: StageProps<PathState>) {
  return (
    <div className="rl-picture">
      <FolderPicture
        drive={state.drive ? { name: "Data drive", free: "7.8 GiB" } : null}
        name={state.name}
        smb={state.smb}
        nfs={false}
        people={["alex", "sam"]}
        guest={false}
        live={false}
      />
    </div>
  );
}

// ─── A group's access fans out ────────────────────────────────────────────────────────────────

export function FanStage({ state }: StageProps<{ family: boolean }>) {
  const changed = useChangedSinceMount(state.family);
  const level = (folder: string): Access =>
    !state.family
      ? "none"
      : folder === "Photos"
        ? "rw"
        : folder === "Music"
          ? "ro"
          : "none";
  return (
    <div className="rl-picture rl-person" data-changed={changed || undefined}>
      <PersonPicture
        name="Robin"
        admin={false}
        groups={[
          { name: "family", on: state.family, opens: ["Photos", "Music"] },
          { name: "kids", on: false, opens: ["Music", "Games"] },
        ]}
        folders={["Photos", "Music", "Games", "Documents"].map((name) => ({
          name,
          access: level(name),
          through: state.family && level(name) !== "none" ? "family" : null,
        }))}
      />
    </div>
  );
}

// ─── A summary sentence changes ───────────────────────────────────────────────────────────────

export interface SummaryState {
  family: boolean;
  guests: boolean;
}

function WarningDrawn() {
  return (
    <svg viewBox="0 0 16 16" className="rl-warn-drawn" aria-hidden="true">
      <path d="M8 2.2 14.4 13.4H1.6Z" pathLength={1} className="rl-warn-edge" />
      <path d="M8 6.4v3.2M8 11.6v.01" className="rl-warn-mark" />
    </svg>
  );
}

// Stable lists: the leaving list reads a new array as a change.
const SENTENCES = [
  { id: "new", kind: "plain" },
  { id: "who", kind: "plain" },
] as const;
const SENTENCES_GUESTS = [
  ...SENTENCES,
  { id: "guests", kind: "warning" },
] as const;

export function SummaryStage({ state }: StageProps<SummaryState>) {
  const [initial] = useState(() => new Set(["new", "who"]));
  const items = state.guests ? SENTENCES_GUESTS : SENTENCES;
  const { entries, left } = useLeavingItems(items, (i) => i.id);
  const words: Record<string, ReactNode> = {
    new: "Photos is a new shared folder on Data drive.",
    who: (
      <Crossfade k={state.family ? "family" : "pair"} reduced="cut">
        {state.family
          ? "Everyone in Family can open it and change its files."
          : "Alex and Sam can open it and change its files."}
      </Crossfade>
    ),
    guests: (
      <>
        <WarningDrawn />
        <span>
          Guests can open it too: anyone on your network can see these files
          without a password.
        </span>
      </>
    ),
  };
  return (
    <ul className="rl-summary">
      {entries.map(({ key, item, leaving }) => (
        <LeavingItem
          key={key}
          leaving={leaving}
          onLeft={() => {
            left(key);
          }}
        >
          <div
            className={initial.has(key) ? "rl-sentence" : "rl-sentence rl-rise"}
            data-kind={item.kind}
          >
            {words[key]}
          </div>
        </LeavingItem>
      ))}
    </ul>
  );
}

// ─── A choice card is picked ──────────────────────────────────────────────────────────────────

export type Kind = "single" | "mirror" | "parity";

const CARDS: { id: Kind; title: string; line: string; disks: number }[] = [
  {
    id: "single",
    title: "One disk",
    line: "All of its space. Nothing is kept if it fails.",
    disks: 1,
  },
  {
    id: "mirror",
    title: "Mirror",
    line: "Two disks, the space of one. Keeps working when a disk fails.",
    disks: 2,
  },
  {
    id: "parity",
    title: "Parity",
    line: "Three disks, the space of two. Keeps working when a disk fails.",
    disks: 3,
  },
];

/** Blocks on disks: copies for a mirror, spread with a parity block for parity. Decorative. */
function ArrangementGlyph({
  kind,
  big = false,
}: {
  kind: Kind;
  big?: boolean;
}) {
  const disks = kind === "single" ? 1 : kind === "mirror" ? 2 : 3;
  const w = 18;
  const gap = 6;
  const width = disks * w + (disks - 1) * gap;
  return (
    <svg
      viewBox={`0 0 ${String(width)} 30`}
      className={big ? "rl-arr rl-arr-big-svg" : "rl-arr"}
      aria-hidden="true"
    >
      {Array.from({ length: disks }, (_, d) => {
        const x = d * (w + gap);
        return (
          <g key={d}>
            <rect
              x={x + 0.75}
              y={0.75}
              width={w - 1.5}
              height={28.5}
              rx={3}
              className="rl-arr-disk"
            />
            {[0, 1, 2].map((b) => {
              const parity = kind === "parity" && (b + d) % 3 === 2;
              return (
                <rect
                  key={b}
                  x={x + 4}
                  y={4 + b * 8}
                  width={w - 8}
                  height={6}
                  rx={1}
                  className={parity ? "rl-arr-parity" : "rl-arr-block"}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function ChoiceCard({
  card,
  picked,
  onPick,
  name,
}: {
  card: (typeof CARDS)[number];
  picked: boolean;
  onPick: () => void;
  name: string;
}) {
  const edgeRef = useRef<SVGRectElement>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    const rect = edgeRef.current;
    if (!rect) {
      return;
    }
    if (firstRef.current) {
      firstRef.current = false;
      rect.setAttribute("pathLength", "1");
      rect.style.setProperty("stroke-dasharray", "1");
      rect.style.setProperty("stroke-dashoffset", picked ? "0" : "1");
      return;
    }
    void drawPath(rect, {
      direction: picked ? "draw" : "retract",
      duration: "--duration-base",
    });
  }, [picked]);
  return (
    <label className="rl-card" data-picked={picked || undefined}>
      <input
        type="radio"
        name={name}
        className="rl-card-input"
        checked={picked}
        onChange={onPick}
      />
      <svg className="rl-card-edge" aria-hidden="true">
        <rect x="1" y="1" rx="11" ref={edgeRef} />
      </svg>
      <span className="rl-card-dot" aria-hidden="true">
        <span />
      </span>
      <span className="rl-card-words">
        <span className="rl-card-title">{card.title}</span>
        <span className="rl-card-line">{card.line}</span>
      </span>
      <span data-glyph={card.id} className="rl-card-glyph">
        <ArrangementGlyph kind={card.id} />
      </span>
    </label>
  );
}

/** Whether the morph runs as a View Transition scoped to an element (see entries/forms.ts). */
const canTransition = () =>
  typeof HTMLElement !== "undefined" &&
  typeof (HTMLElement.prototype as { startViewTransition?: unknown })
    .startViewTransition === "function";

export function ChoiceStage({
  state,
  update,
  pane,
}: StageProps<{ picked: Kind | null }>) {
  const reduced = useReducedMotion();
  const changed = useChangedSinceMount(state.picked);
  const name = `rl-arrangement-${pane}`;
  const drawing = state.picked ? (
    <figure className="rl-arr-big">
      <ArrangementGlyph kind={state.picked} big />
      <figcaption>{CARDS.find((c) => c.id === state.picked)?.title}</figcaption>
    </figure>
  ) : (
    <p className="rl-arr-empty">Pick an arrangement to see it drawn.</p>
  );
  return (
    <div className="rl-choice">
      <div
        className="rl-cards"
        role="radiogroup"
        aria-label="How the disks work together"
      >
        {CARDS.map((card) => (
          <ChoiceCard
            key={card.id}
            card={card}
            name={name}
            picked={state.picked === card.id}
            onPick={() => {
              update(() => ({ picked: card.id }));
            }}
          />
        ))}
      </div>
      <div className="rl-arr-side" data-pane-drawing={pane}>
        {reduced ? (
          <Crossfade k={state.picked ?? "none"}>{drawing}</Crossfade>
        ) : (
          <div
            key={state.picked ?? "none"}
            className={changed && !canTransition() ? "rl-grow" : undefined}
          >
            {drawing}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── More options opens ───────────────────────────────────────────────────────────────────────

export function MoreStage({
  state,
  update,
}: StageProps<{ open: boolean; changed: number }>) {
  return (
    <Disclosure
      open={state.open}
      onOpenChange={(open) => {
        update((s) => ({ ...s, open }));
      }}
      className="rl-more"
    >
      <DisclosureTrigger>
        More options (<RollingNumber value={state.changed} /> changed)
      </DisclosureTrigger>
      <DisclosurePanel>
        <dl className="rl-facts">
          <div>
            <dt>Recycle bin</dt>
            <dd>On, deleted files kept for 30 days (changed)</dd>
          </div>
          <div>
            <dt>Hide files that start with a dot</dt>
            <dd>{state.changed > 1 ? "On (changed)" : "Off"}</dd>
          </div>
          <div>
            <dt>Comment</dt>
            <dd>None</dd>
          </div>
        </dl>
      </DisclosurePanel>
    </Disclosure>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────────────────────

export function StrengthStage({
  state,
  pane,
}: StageProps<{ strong: boolean }>) {
  const id = `rl-pw-${pane}`;
  return (
    <div className="rl-password">
      <label htmlFor={id} className="rl-label">
        Password
      </label>
      <input
        id={id}
        type="password"
        className="rl-input"
        readOnly
        autoComplete="new-password"
        value={state.strong ? "sunny-harbour-47-lantern" : "sunny"}
        aria-describedby={`${id}-strength`}
      />
      <div className="rl-strength" data-strong={state.strong || undefined}>
        <span
          className="rl-strength-line"
          style={{ "--v": state.strong ? 1 : 0.25 } as CSSProperties}
        />
      </div>
      <p id={`${id}-strength`} className="rl-strength-word">
        <Crossfade k={state.strong ? "strong" : "weak"} reduced="cut">
          {state.strong
            ? "Strong: long and hard to guess."
            : "Weak: short and a common word."}
        </Crossfade>
      </p>
    </div>
  );
}

// ─── Suggested password ───────────────────────────────────────────────────────────────────────

/** A copy button that acts out its copy: the glyph becomes a check for 1.5s. It does not touch the clipboard. */
export function CopyGlyphButton({
  copies,
  onCopy,
  label = "Copy",
}: {
  /** Bumped by each copy, from the cause or the button itself. */
  copies: number;
  onCopy: () => void;
  label?: string;
}) {
  const still = useStill();
  const [shownFor, setShownFor] = useState(copies);
  const [copied, setCopied] = useState(false);
  if (shownFor !== copies) {
    setShownFor(copies);
    setCopied(true);
  }
  useEffect(() => {
    if (!copied || still) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied, copies, still]);
  return (
    <Button
      variant="neutral"
      size="sm"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
    >
      <Crossfade
        k={copied ? "check" : "copy"}
        reduced="cut"
        className="rl-glyph-swap"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Crossfade>
      <span aria-hidden="true">{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function SuggestStage({
  state,
  update,
  pane,
}: StageProps<{ suggested: boolean; copies: number }>) {
  const reduced = useReducedMotion();
  const changed = useChangedSinceMount(state.suggested);
  const id = `rl-sg-${pane}`;
  return (
    <div className="rl-password">
      <label htmlFor={id} className="rl-label">
        Password
      </label>
      <div className="rl-field-row">
        <input
          key={state.suggested ? "s" : "e"}
          id={id}
          type="text"
          className={changed && !reduced ? "rl-input rl-fade" : "rl-input"}
          readOnly
          autoComplete="off"
          spellCheck={false}
          value={state.suggested ? "harbour-lantern-47-maple" : ""}
        />
        <CopyGlyphButton
          copies={state.copies}
          onCopy={() => {
            update((s) => ({ ...s, copies: s.copies + 1 }));
          }}
        />
      </div>
      <StageNote>The reel does not write to your clipboard.</StageNote>
    </div>
  );
}

// ─── Errors on submit ─────────────────────────────────────────────────────────────────────────

export function ErrorsStage({ state, pane }: StageProps<{ submits: number }>) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const shown = state.submits > 0;
  // Focus moves to the summary on each submit. Only the Full pane takes it: focus is in one place.
  useEffect(() => {
    if (shown && pane === "full") {
      summaryRef.current?.focus();
    }
  }, [shown, state.submits, pane]);
  const id = (f: string) => `rl-err-${pane}-${f}`;
  return (
    <form
      className="rl-errform"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {shown ? (
        <div
          key={state.submits}
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className={reduced ? "rl-errsum" : "rl-errsum rl-rise"}
        >
          <p className="rl-errsum-title">
            Two answers need a change before the folder can be created.
          </p>
          <ul>
            <li>
              <a href={`#${id("name")}`}>Give the folder a name.</a>
            </li>
            <li>
              <a href={`#${id("who")}`}>Choose who can open it.</a>
            </li>
          </ul>
        </div>
      ) : null}
      <div className="rl-errfield" data-invalid={shown || undefined}>
        <label htmlFor={id("name")} className="rl-label">
          Name
        </label>
        <input
          id={id("name")}
          className="rl-input"
          readOnly
          value=""
          aria-invalid={shown || undefined}
        />
        {shown ? <p className="rl-errtext">Give the folder a name.</p> : null}
      </div>
      <div className="rl-errfield" data-invalid={shown || undefined}>
        <label htmlFor={id("who")} className="rl-label">
          Who can open it
        </label>
        <input
          id={id("who")}
          className="rl-input"
          readOnly
          value=""
          aria-invalid={shown || undefined}
        />
        {shown ? <p className="rl-errtext">Choose who can open it.</p> : null}
      </div>
    </form>
  );
}

// ─── The run ──────────────────────────────────────────────────────────────────────────────────

const RUN_STEPS = [
  "Create the folder Photos on Data drive",
  "Share it with Windows and Mac computers",
  "Let Alex and Sam open it",
];
const STEP_MS = 700;

function RunStep({
  words,
  state,
}: {
  words: string;
  state: "waiting" | "running" | "done";
}) {
  const check = useDraw(state === "done", { duration: "--duration-base" });
  return (
    <li className="rl-run-step" data-state={state}>
      <svg viewBox="0 0 20 20" className="rl-run-mark" aria-hidden="true">
        <circle cx="10" cy="10" r="8.25" className="rl-run-track" />
        <circle
          cx="10"
          cy="10"
          r="8.25"
          pathLength={1}
          className="rl-run-ring"
          style={{ "--step-ms": `${String(STEP_MS)}ms` } as CSSProperties}
        />
        <path d="M6 10.4l2.7 2.6L14 7.6" className="rl-run-check" ref={check} />
      </svg>
      <span>{words}</span>
      <span className="rl-run-word">
        {state === "done"
          ? "Done"
          : state === "running"
            ? "Running"
            : "Waiting"}
      </span>
    </li>
  );
}

export function RunStage({ state }: StageProps<{ runs: number }>) {
  const [at, setAt] = useState(state.runs > 0 ? RUN_STEPS.length : -1);
  const [runs, setRuns] = useState(state.runs);
  if (runs !== state.runs) {
    setRuns(state.runs);
    setAt(0);
  }
  useEffect(() => {
    if (at < 0 || at >= RUN_STEPS.length) {
      return;
    }
    const timer = window.setTimeout(() => {
      setAt((a) => a + 1);
    }, STEP_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [at]);
  return (
    <ol className="rl-run">
      {RUN_STEPS.map((words, i) => (
        <RunStep
          key={words}
          words={words}
          state={at < 0 || i > at ? "waiting" : i === at ? "running" : "done"}
        />
      ))}
    </ol>
  );
}

// ─── It is live ───────────────────────────────────────────────────────────────────────────────

export function LiveStage({ state }: StageProps<{ live: number }>) {
  const reduced = useReducedMotion();
  return (
    <div className="rl-live">
      <div className="rl-picture">
        <FolderPicture
          key={state.live}
          drive={{ name: "Data drive", free: "7.8 GiB" }}
          name="Photos"
          smb
          nfs={false}
          people={["alex", "sam"]}
          guest={false}
          live={state.live > 0}
        />
      </div>
      {state.live > 0 ? (
        <div
          key={state.live}
          className={reduced ? "rl-done rl-fade" : "rl-done rl-rise"}
        >
          <p className="rl-done-title">Photos is ready.</p>
          <p className="rl-done-line">
            Alex and Sam can open it from Windows and Mac computers now.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Save settle and the pending flight ───────────────────────────────────────────────────────

export function SaveStage({ state, update }: StageProps<{ saves: number }>) {
  const reduced = useReducedMotion();
  const still = useStill();
  const { first, done } = useFirstTime("motion.first-pending-flight");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [saves, setSaves] = useState(state.saves);
  const [count, setCount] = useState(1 + state.saves);
  const [saved, setSaved] = useState(false);
  const [tip, setTip] = useState(false);
  // The flight on its way, and the count it brings.
  const [flying, setFlying] = useState<{ n: number; count: number } | null>(
    null,
  );
  if (saves !== state.saves) {
    setSaves(state.saves);
    setSaved(true);
    if (first) {
      setTip(true);
    }
    if (reduced) {
      // No flight: the count changes.
      setCount(1 + state.saves);
    } else {
      setFlying({ n: state.saves, count: 1 + state.saves });
    }
  }
  useEffect(() => {
    if (tip) {
      done();
    }
  }, [tip, done]);
  useEffect(() => {
    const from = buttonRef.current;
    const to = countRef.current;
    if (flying === null || !from || !to) {
      return;
    }
    let live = true;
    void flyPendingMark(from, to).then(() => {
      if (live) {
        setCount(flying.count);
        popElement(countRef.current);
      }
    });
    return () => {
      live = false;
    };
  }, [flying]);
  useEffect(() => {
    if (!saved || still) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSaved(false);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [saved, saves, still]);
  return (
    <div className="rl-save">
      <div className="rl-topbar">
        <span className="rl-topbar-host">nas</span>
        <span className="rl-pending" ref={countRef}>
          <span className="rl-pending-mark" aria-hidden="true" />
          <span>
            Changes waiting: <RollingNumber value={count} />
          </span>
        </span>
      </div>
      <div className="rl-setting">
        <span className="rl-label">Workgroup</span>
        <span className="rl-setting-value">WORKGROUP</span>
      </div>
      <div className="rl-savebar">
        <Button
          ref={buttonRef}
          variant="primary"
          size="sm"
          className="rl-savebtn"
          onClick={() => {
            update((s) => ({ saves: s.saves + 1 }));
          }}
        >
          <Crossfade k={saved ? "saved" : "save"} reduced="cut">
            {saved ? (
              <span className="rl-saved">
                <DrawnCheck />
                Saved
              </span>
            ) : (
              "Save"
            )}
          </Crossfade>
        </Button>
        {tip ? (
          <p className={reduced ? "rl-tip" : "rl-tip rl-rise"}>
            Saved. Your change waits in the yellow bar until you apply it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Impact sharpens ──────────────────────────────────────────────────────────────────────────

export function ImpactStage({ state }: StageProps<{ changed: boolean }>) {
  return (
    <div className="rl-impact">
      <p className="rl-impact-field">
        <span className="rl-label">Address</span>
        <span className="rl-mono">
          {state.changed ? "192.0.2.20" : "192.0.2.10"}
        </span>
      </p>
      <div
        className="rl-net"
        data-gap={state.changed || undefined}
        aria-hidden="true"
      >
        <span className="rl-net-end">
          <Monitor />
          This browser
        </span>
        <span className="rl-net-line">
          <span className="rl-net-half" data-side="start" />
          <span className="rl-net-half" data-side="end" />
        </span>
        <span className="rl-net-end">
          <Server />
          NAS
        </span>
      </div>
      <Crossfade k={state.changed ? "cut" : "none"} className="rl-impact-xf">
        {state.changed ? (
          <ImpactLine
            impact="mayCut"
            detail="This browser reaches the NAS at 192.0.2.10. After the change the NAS will be at 192.0.2.20."
          >
            This page may stop working.
          </ImpactLine>
        ) : (
          <ImpactLine impact="none">This page keeps working.</ImpactLine>
        )}
      </Crossfade>
    </div>
  );
}
