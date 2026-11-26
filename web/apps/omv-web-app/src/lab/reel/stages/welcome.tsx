// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's welcome and first visit (rethink 7.2, with 6.8 for the map): the NAS assembling, the
// welcome line leaving, a ghost becoming the first storage, a first step landing and the first steps folding
// into Shortcuts. Lab fixtures only, the dashboard lab's own. Development only (UI-11).
import {
  animateElement,
  Button,
  Crossfade,
  curveAt,
  durationAt,
  useDrawPath,
} from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../../../hooks/useMotionPreference.ts";
import { WelcomeLine } from "../../dashboard/Answer.tsx";
import type { Nas } from "../../dashboard/model.ts";
import { accentAt, layoutFor, mapView } from "../../dashboard/model.ts";
import { SystemMap } from "../../dashboard/SystemMap.tsx";
import { StepMark } from "../parts.tsx";
import type { StageProps } from "../types.ts";
import { twoRowNas } from "./fixtures.ts";
import { useWidth } from "./useWidth.ts";

const noop = () => undefined;

/** The dashboard lab's map, drawn in a pane at the pane's own width. */
export function PaneMap({
  nas,
  assemble,
}: {
  nas: Nas;
  assemble: "full" | "none";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const view = useMemo(() => mapView(nas), [nas]);
  return (
    <div ref={ref} className="rl-map">
      <SystemMap
        nas={nas}
        view={view}
        layout={layoutFor(width)}
        loading={false}
        accent={accentAt(nas, false)}
        assemble={assemble}
        captions={[]}
        arrival={null}
        showTraceTip={false}
        onTraced={noop}
        onDismissTip={noop}
        stepActions={[]}
        retrying={[]}
        onRetry={noop}
        onNote={noop}
      />
    </div>
  );
}

// ─── The NAS assembles ────────────────────────────────────────────────────────────────────────

export function AssembleStage({ state }: StageProps<{ visit: number }>) {
  const reduced = useReducedMotion();
  const nas = useMemo(twoRowNas, []);
  const played = state.visit > 0;
  return (
    <div
      key={state.visit}
      className={played && reduced ? "rl-fade" : undefined}
    >
      <PaneMap nas={nas} assemble={played && !reduced ? "full" : "none"} />
    </div>
  );
}

// ─── The welcome line leaves ──────────────────────────────────────────────────────────────────

export function WelcomeStage({ state, update }: StageProps<{ gone: boolean }>) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">(
    state.gone ? "gone" : "shown",
  );
  if (state.gone && phase === "shown") {
    setPhase(reduced ? "gone" : "leaving");
  }
  return (
    <div className="rl-welcome">
      <p className="rl-answer">Everything is working.</p>
      {phase === "gone" ? null : (
        <WelcomeLine
          leaving={phase === "leaving"}
          compact
          onDismiss={() => {
            update(() => ({ gone: true }));
          }}
          onLeft={() => {
            setPhase("gone");
          }}
          onNote={noop}
        />
      )}
      <div className="rl-below">
        <p className="rl-below-title">Your NAS</p>
        <p className="rl-below-line">Data drive: 62 % used, 1.4 TiB free.</p>
        <p className="rl-below-line">Backup: 41 % used, 2.1 TiB free.</p>
      </div>
    </div>
  );
}

// ─── A ghost becomes the first storage ─────────────────────────────────────────────────────────────────────

export function GhostStage({ state }: StageProps<{ created: boolean }>) {
  const wire = useDrawPath(state.created, { duration: "--duration-slow" });
  return (
    <div className="rl-ghostrow">
      <span className="rl-disk-chip">sda</span>
      <svg className="rl-wire" viewBox="0 0 48 8" aria-hidden="true">
        <path d="M0 4H48" className="rl-wire-track" />
        <path d="M0 4H48" className="rl-wire-draw" ref={wire} />
      </svg>
      <div className="rl-node" data-created={state.created || undefined}>
        <svg className="rl-node-edge" aria-hidden="true">
          <rect x="1" y="1" rx="9" />
        </svg>
        <Crossfade contentKey={state.created ? "created" : "ghost"}>
          {state.created ? (
            <span className="rl-node-words">
              <span className="rl-node-name">Data drive</span>
              <span className="rl-node-fact">EXT4, 3.6 TiB free</span>
            </span>
          ) : (
            <span className="rl-node-words">
              <span className="rl-node-ghost">Add storage</span>
              <span className="rl-node-fact">Not in use: sda, sdb</span>
            </span>
          )}
        </Crossfade>
      </div>
    </div>
  );
}

// ─── A first step lands ───────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "storage", title: "Add storage", action: "Add storage" },
  {
    id: "folder",
    title: "Add a shared folder",
    action: "Add a shared folder",
  },
  {
    id: "smb",
    title: "Turn on sharing for Windows and Mac",
    action: "Turn on sharing",
  },
  { id: "person", title: "Add a person", action: "Add a person" },
] as const;

const COUNT_WORDS = ["none", "one", "two", "three", "four"];

function StepsList({ done }: { done: number }) {
  return (
    <ul className="rl-steps">
      {STEPS.map((step, i) => {
        const isDone = i < done;
        const isNext = i === done;
        return (
          <li key={step.id} className="rl-step" data-done={isDone || undefined}>
            <StepMark done={isDone} />
            <span className="rl-step-title">{step.title}</span>
            {isDone ? (
              <span className="rl-step-state">Done</span>
            ) : (
              <Button
                variant={isNext ? "primary" : "ghost"}
                size="sm"
                className="rl-btn-base"
              >
                {step.action}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function StepStage({ state }: StageProps<{ done: number }>) {
  return (
    <div className="rl-firststeps">
      <p className="rl-firststeps-head">
        First steps: {COUNT_WORDS[state.done]} of four done
      </p>
      <div
        className="rl-bar"
        role="meter"
        aria-label="First steps done"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={state.done}
      >
        <span
          className="rl-bar-fill rl-bar-glide"
          style={{ "--v": state.done / 4 } as CSSProperties}
        />
      </div>
      <StepsList done={state.done} />
    </div>
  );
}

// ─── Set up ───────────────────────────────────────────────────────────────────────────────────

const SHORTCUTS = ["Add a shared folder", "Add a person", "Check disk health"];

function SetUpView() {
  return (
    <div className="rl-setup">
      <p className="rl-setup-line">
        <StepMark done />
        <span className="rl-setup-word">Set up</span>
      </p>
      <div className="rl-shortcuts" role="group" aria-label="Shortcuts">
        <span className="rl-shortcuts-label">Shortcuts</span>
        {SHORTCUTS.map((s) => (
          <Button key={s} variant="ghost" size="sm">
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function SetUpStage({ state }: StageProps<{ setUp: boolean }>) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);
  const [gathering, setGathering] = useState(false);
  const [was, setWas] = useState(state.setUp);
  if (was !== state.setUp) {
    setWas(state.setUp);
    setGathering(state.setUp && !reduced);
  }

  // The checks gather into the first one and the list folds into the shortcuts (FLIP on the
  // checks, the box's height from the list's to the new view's), 360ms on the settle spring.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const before = heightRef.current;
    heightRef.current = box.getBoundingClientRect().height;
    const ghost = ghostRef.current;
    if (!gathering || !ghost) {
      return;
    }
    const slow = durationAt(box, "--duration-slow");
    const settle = curveAt(box, "--ease-settle");
    animateElement(
      box,
      [
        { height: `${String(before)}px` },
        { height: `${String(heightRef.current)}px` },
      ],
      { duration: slow, easing: settle },
    );
    const marks = [...ghost.querySelectorAll(".rl-stepmark")];
    const first = marks[0]?.getBoundingClientRect();
    for (const mark of marks) {
      const r = mark.getBoundingClientRect();
      if (first) {
        animateElement(
          mark,
          [
            { translate: "0 0" },
            {
              translate: `${String(first.left - r.left)}px ${String(first.top - r.top)}px`,
            },
          ],
          { duration: slow, easing: settle, fill: "forwards" },
        );
      }
    }
    for (const words of ghost.querySelectorAll(
      ".rl-step-title, .rl-step-state, button",
    )) {
      animateElement(words, [{ opacity: 1 }, { opacity: 0 }], {
        duration: durationAt(box, "--duration-fast"),
        easing: curveAt(box, "--ease-exit"),
        fill: "forwards",
      });
    }
    const timer = window.setTimeout(() => {
      setGathering(false);
    }, slow);
    return () => {
      window.clearTimeout(timer);
    };
  }, [gathering]);

  return (
    <div ref={boxRef} className="rl-setup-box">
      {reduced ? (
        <Crossfade contentKey={state.setUp ? "set" : "steps"}>
          {state.setUp ? <SetUpView /> : <StepsList done={3} />}
        </Crossfade>
      ) : state.setUp ? (
        <>
          <div className="rl-settle">
            <SetUpView />
          </div>
          {gathering ? (
            <div ref={ghostRef} className="rl-gather" aria-hidden="true" inert>
              <StepsList done={4} />
            </div>
          ) : null}
        </>
      ) : (
        <StepsList done={3} />
      )}
    </div>
  );
}
