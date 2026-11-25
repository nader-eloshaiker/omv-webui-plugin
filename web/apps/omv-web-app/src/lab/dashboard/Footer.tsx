// SPDX-License-Identifier: GPL-3.0-or-later
// Region E (rethink spec 6.2 E, 6.8, 7.2): left, 8 of 12, First steps as a row of four numbered
// steps with the current one's button in the accent (filled when nothing else on the page is,
// outlined otherwise), or Shortcuts in the same slot when the steps are done or tips are off; right,
// 4 of 12, This NAS as facts in two columns, ending in "Show me around", which replays the first
// visit. Both blocks are about the same height by design, and each fits its content, so neither
// stretches into a blank strip. A step that is done draws its check and the next step's button fills
// from the start edge (7.2, "A first step lands"). Compact density keeps a step's title and button
// and drops its explanation (owner decision 11). Lab-local candidates for *FirstStepsStepper,
// *Shortcuts (spec 8 row 1). Development only (UI-11).
import { Button, Icon } from "@omv-webui/react-ui-components";
import { ArrowRight, ExternalLink, Play } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { Facts, Step } from "./model.ts";
import { currentStep } from "./model.ts";

export function FirstSteps({
  steps,
  filled,
  placement,
  compact,
  onNote,
}: {
  steps: readonly Step[];
  /** Whether the current step's button is the screen's filled accent (A2). */
  filled: boolean;
  /** Under region A on a new NAS, or in region E. */
  placement: "top" | "foot";
  /** Compact density: each step's title and button, without its explanation. */
  compact: boolean;
  onNote: (text: string) => void;
}) {
  // A step that was not done when the stepper was drawn and is done now has just landed (7.2).
  const [initial] = useState(
    () => new Set(steps.filter((s) => s.done).map((s) => s.id)),
  );
  const now = currentStep(steps);
  const done = steps.filter((s) => s.done).length;
  return (
    <section
      className="dm-steps"
      data-placement={placement}
      aria-labelledby={`dm-steps-title-${placement}`}
    >
      <header className="dm-steps-head">
        <h2
          id={`dm-steps-title-${placement}`}
          className="dm-region-title dm-region-title-sm"
        >
          First steps
        </h2>
        <span className="dm-steps-count">
          {done} of {steps.length} done
        </span>
        <span
          className="dm-steps-bar"
          aria-hidden="true"
          style={{ "--v": done / steps.length } as CSSProperties}
        />
      </header>
      <ol className="dm-stepper">
        {steps.map((step, i) => {
          const current = step.id === now?.id;
          const landed = step.done && !initial.has(step.id);
          return (
            <li
              key={step.id}
              className="dm-step"
              data-done={step.done || undefined}
              data-current={current || undefined}
              data-landed={landed || undefined}
              aria-current={current ? "step" : undefined}
            >
              <span className="dm-step-disc" aria-hidden="true">
                {step.done ? (
                  <svg viewBox="0 0 16 16" className="dm-step-check">
                    <path d="M4 8.5l2.6 2.6L12 5.6" pathLength={1} />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="dm-step-words">
                <span className="dm-step-title">
                  {step.title}
                  {step.done ? <span className="sr-only"> (done)</span> : null}
                </span>
                {compact ? null : (
                  <span className="dm-step-line">{step.line}</span>
                )}
              </span>
              {step.done ? null : (
                <Button
                  // The current step's button fills from the start edge when the step before lands.
                  key={current ? `now:${String(done)}` : "later"}
                  variant={
                    current
                      ? filled
                        ? "primary"
                        : "primaryOutline"
                      : "neutral"
                  }
                  size="sm"
                  className="dm-step-action"
                  data-just-current={
                    current && done > initial.size ? "" : undefined
                  }
                  onClick={() => {
                    onNote(`${step.action} opens its page.`);
                  }}
                >
                  {step.action}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * When the steps are done or tips are off: what the map does not already offer, as a short list of
 * rows. The map's own actions (Add a shared folder, Check disk health) stay with the map, so each
 * action is on the screen once.
 */
export function Shortcuts({ onNote }: { onNote: (text: string) => void }) {
  const items = [
    {
      icon: <Icon name="person" mark="create" size={20} />,
      words: "Add a person",
      note: "Add a person opens its page.",
    },
    {
      icon: <Icon name="group" mark="create" size={20} />,
      words: "Add a group",
      note: "Add a group opens its page.",
    },
    {
      icon: <ExternalLink aria-hidden="true" />,
      words: "Open the classic interface",
      note: "Opens the classic interface in a new tab.",
    },
  ];
  return (
    <section
      className="dm-steps dm-shortcuts"
      aria-labelledby="dm-shortcuts-title"
    >
      <h2
        id="dm-shortcuts-title"
        className="dm-region-title dm-region-title-sm"
      >
        Shortcuts
      </h2>
      <ul className="dm-shortcut-list">
        {items.map((item) => (
          <li key={item.words}>
            <button
              type="button"
              className="dm-shortcut"
              onClick={() => {
                onNote(item.note);
              }}
            >
              <span className="dm-shortcut-icon">{item.icon}</span>
              {item.words}
              <ArrowRight aria-hidden="true" className="dm-shortcut-go" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ThisNas({
  facts,
  onNote,
  onShowAround,
}: {
  facts: Facts;
  onNote: (text: string) => void;
  /** Replays the first visit: the map assembles, the welcome line and the captions come back. */
  onShowAround: () => void;
}) {
  return (
    <section
      id="dm-facts"
      tabIndex={-1}
      className="dm-facts"
      aria-labelledby="dm-facts-title"
    >
      <header className="dm-facts-head">
        <h2 id="dm-facts-title" className="dm-region-title dm-region-title-sm">
          This NAS
        </h2>
        <Button
          variant="quiet"
          size="sm"
          className="dm-show-around"
          onClick={onShowAround}
        >
          <Play aria-hidden="true" />
          Show me around
        </Button>
      </header>
      <dl className="dm-factgrid">
        <div className="dm-fact">
          <dt>Name</dt>
          <dd className="dm-mono">{facts.name}</dd>
        </div>
        <div className="dm-fact">
          <dt>Version</dt>
          <dd>{facts.version}</dd>
        </div>
        <div className="dm-fact">
          <dt>Running for</dt>
          <dd>{facts.uptime}</dd>
        </div>
        <div className="dm-fact">
          <dt>Time on the NAS</dt>
          <dd>{facts.time}</dd>
        </div>
        <div className="dm-fact dm-fact-wide">
          <dt>Updates</dt>
          <dd>
            <button
              type="button"
              className="dm-link"
              onClick={() => {
                onNote("Opens Updates.");
              }}
            >
              {facts.updates} to install
              <ArrowRight aria-hidden="true" />
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
