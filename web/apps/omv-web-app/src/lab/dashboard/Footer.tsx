// SPDX-License-Identifier: GPL-3.0-or-later
// Region E (rethink spec 6.2 E, 6.8, 7.2), on the page ground: left, 8 of 12, First steps as a
// checklist (a tick when done, an empty circle when not; no numbers and no rail) with the next step's
// button in the accent (filled when nothing else on the page is, outlined otherwise), or Shortcuts in
// the same place when the steps are done or tips are off; right, 4 of 12, This NAS as labelled facts,
// ending in "Show me around", which replays the first visit. A step that is done draws its tick
// (7.2, "A first step lands"): motion that answers a change, never an entrance. Compact density keeps
// a step's title and button and drops its explanation (owner decision 11). Lab-local candidates for
// *FirstSteps and *Shortcuts (spec 8 row 1). Development only (UI-11).
import { Button, Icon } from "@omv-webui/react-ui-components";
import { ExternalLink, Play } from "lucide-react";
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
  // A step that was not done when the list was drawn and is done now has just landed (7.2).
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
      <header className="dm-region-head">
        <h2
          id={`dm-steps-title-${placement}`}
          className="dm-region-title dm-region-title-sm"
        >
          First steps
        </h2>
        <p className="dm-region-note">
          {done} of {steps.length} done
        </p>
      </header>
      <ul className="dm-checklist">
        {steps.map((step) => {
          const current = step.id === now?.id;
          const landed = step.done && !initial.has(step.id);
          return (
            <li
              key={step.id}
              className="dm-check"
              data-done={step.done || undefined}
              data-current={current || undefined}
              data-landed={landed || undefined}
              aria-current={current ? "step" : undefined}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="dm-check-mark"
              >
                <circle cx="10" cy="10" r="8.25" />
                {step.done ? (
                  <path d="M6 10.4l2.7 2.7L14.2 7.6" pathLength={1} />
                ) : null}
              </svg>
              <span className="dm-check-words">
                <span className="dm-check-title">
                  {step.title}
                  {step.done ? <span className="sr-only"> (done)</span> : null}
                </span>
                {compact ? null : (
                  <span className="dm-check-line">{step.line}</span>
                )}
              </span>
              {step.done ? null : (
                <Button
                  variant={
                    current
                      ? filled
                        ? "primary"
                        : "primaryOutline"
                      : "neutral"
                  }
                  size="sm"
                  className="dm-check-action"
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
      </ul>
    </section>
  );
}

/**
 * When the steps are done or tips are off: what the map does not already offer, as a short list of
 * text buttons. The map's own actions (Add a shared folder, Check disk health) stay with the map, so
 * each action is on the screen once.
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
      <header className="dm-region-head">
        <h2
          id="dm-shortcuts-title"
          className="dm-region-title dm-region-title-sm"
        >
          Shortcuts
        </h2>
      </header>
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
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ThisNas({
  facts,
  addOns,
  onNote,
  onShowAround,
}: {
  facts: Facts;
  /** The installed add-ons this interface does not draw, by their short name. */
  addOns: readonly string[];
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
      <header className="dm-region-head">
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
            {facts.updates === 0 ? (
              "The NAS is up to date."
            ) : (
              <button
                type="button"
                className="dm-link"
                onClick={() => {
                  onNote("Opens Updates.");
                }}
              >
                {facts.updates} to install
              </button>
            )}
          </dd>
        </div>
        {addOns.length > 0 ? (
          <div className="dm-fact dm-fact-wide">
            <dt>Add-ons</dt>
            <dd>
              {addOns.join(", ")},{" "}
              <button
                type="button"
                className="dm-link"
                onClick={() => {
                  onNote("Opens the classic interface in a new tab.");
                }}
              >
                open in the classic interface
                <ExternalLink aria-hidden="true" />
              </button>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
