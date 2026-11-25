// SPDX-License-Identifier: GPL-3.0-or-later
// Region E (rethink spec 6.2 E, 7.2): left, 8 of 12, First steps as a row of four numbered steps with
// the current one's button in the accent (filled when nothing else on the page is, outlined
// otherwise), or Shortcuts in the same slot when the steps are done or tips are off; right, 4 of 12,
// This NAS as a two-column fact list. The two are one row of equal height, so neither leaves a hole.
// A step that is done draws its check and the next step's button fills from the start edge (7.2,
// "A first step lands"). Lab-local candidates for *FirstStepsStepper, *Shortcuts (spec 8 row 1).
// Development only (UI-11).
import {
  Button,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Icon,
} from "@omv-webui/react-ui-components";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { Facts, Step } from "./model.ts";
import { currentStep } from "./model.ts";

export function FirstSteps({
  steps,
  filled,
  placement,
  onNote,
}: {
  steps: readonly Step[];
  /** Whether the current step's button is the screen's filled accent (A2). */
  filled: boolean;
  /** Under region A on a new NAS, or in region E. */
  placement: "top" | "foot";
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
                <span className="dm-step-line">{step.line}</span>
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

export function Shortcuts({ onNote }: { onNote: (text: string) => void }) {
  const items = [
    {
      icon: <Icon name="shared-folder" mark="create" size={20} />,
      words: "Add a shared folder",
    },
    {
      icon: <Icon name="person" mark="create" size={20} />,
      words: "Add a person",
    },
    {
      icon: <Icon name="check-health" size={20} />,
      words: "Check disk health",
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
            <Button
              variant="neutral"
              size="md"
              className="dm-shortcut"
              onClick={() => {
                onNote(`${item.words} opens its page.`);
              }}
            >
              {item.icon}
              {item.words}
            </Button>
          </li>
        ))}
        <li>
          <Button
            variant="ghost"
            size="md"
            className="dm-shortcut"
            onClick={() => {
              onNote("Opens the classic interface in a new tab.");
            }}
          >
            Open the classic interface
            <ExternalLink aria-hidden="true" />
          </Button>
        </li>
      </ul>
    </section>
  );
}

export function ThisNas({
  facts,
  onNote,
}: {
  facts: Facts;
  onNote: (text: string) => void;
}) {
  return (
    <section
      id="dm-facts"
      tabIndex={-1}
      className="dm-facts"
      aria-labelledby="dm-facts-title"
    >
      <h2 id="dm-facts-title" className="dm-region-title dm-region-title-sm">
        This NAS
      </h2>
      <FactList className="dm-factlist">
        <FactListItem>
          <FactListLabel>Name</FactListLabel>
          <FactListValue variant="identifier">{facts.name}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Version</FactListLabel>
          <FactListValue>{facts.version}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Running for</FactListLabel>
          <FactListValue>{facts.uptime}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Updates</FactListLabel>
          <FactListValue>
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
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Time on the NAS</FactListLabel>
          <FactListValue>{facts.time}</FactListValue>
        </FactListItem>
      </FactList>
    </section>
  );
}
