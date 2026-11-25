// SPDX-License-Identifier: GPL-3.0-or-later
// Region A, the answer (rethink spec 6.2 A, P.2): one full short sentence and its reason, on the page
// ground. No row of area chips under it: the sentence and what needs you carry the state, and the map
// shows each thing's state in place. Above it, on an existing NAS seen in the new interface for the
// first time, the one-line welcome. Lab-local candidates for *StatusLine and *WelcomeLine (spec 8
// row 1). Development only (UI-11).
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Icon,
  IconBadge,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { Answer } from "./model.ts";

/** The answer's mark: the state in its own shape, the size of the heading's first line. */
function AnswerMark({
  tone,
  welcome,
}: {
  tone: Answer["tone"];
  welcome: boolean;
}) {
  if (welcome) {
    return (
      <span aria-hidden="true" className="dm-answer-mark">
        <Icon name="nas" size={24} motion="none" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="dm-answer-mark" data-tone={tone}>
      <svg viewBox="0 0 24 24">
        <IconBadge status={tone} cx={12} cy={12} r={10} strokeWidth={1.5} />
      </svg>
    </span>
  );
}

export function AnswerRegion({
  answer,
  loading,
  welcome,
  reason,
}: {
  answer: Answer;
  loading: boolean;
  welcome: boolean;
  /** Whether the reason shows: not when what needs you lists it in its first row just below. */
  reason: boolean;
}) {
  return (
    <section
      className="dm-answer"
      aria-labelledby="dm-answer-title"
      aria-busy={loading || undefined}
    >
      {loading ? (
        <Skeleton
          shape="block"
          className="dm-answer-mark dm-answer-mark-loading"
        />
      ) : (
        <AnswerMark tone={answer.tone} welcome={welcome} />
      )}
      <div className="dm-answer-words" aria-live="polite">
        <h1 id="dm-answer-title" className="dm-answer-title">
          {loading ? "Reading the NAS…" : answer.title}
        </h1>
        {loading || !reason ? null : (
          <p className="dm-answer-reason">{answer.reason}</p>
        )}
      </div>
    </section>
  );
}

/**
 * The welcome on an existing NAS seen in the new interface (P.2, G2): one line, "What is different"
 * as a disclosure and a way back to the classic interface. Leaves with "Got it" or any action.
 */
export function WelcomeLine({
  leaving,
  compact,
  onDismiss,
  onLeft,
  onNote,
}: {
  leaving: boolean;
  /** Compact density keeps the first sentence only (owner decision 11). */
  compact: boolean;
  onDismiss: () => void;
  onLeft: () => void;
  onNote: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="dm-welcome"
      data-leaving={leaving || undefined}
      data-welcome-line=""
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          onLeft();
        }
      }}
    >
      <div className="dm-welcome-inner">
        <p className="dm-welcome-words">
          <Icon name="nas" size={20} motion="none" />
          <span>
            Welcome to the new interface.
            {compact
              ? null
              : " Your settings and files are the same; only the way you see them is new."}
          </span>
        </p>
        <div className="dm-welcome-actions">
          <Disclosure
            open={open}
            onOpenChange={setOpen}
            className="dm-welcome-more"
          >
            <DisclosureTrigger variant="inline">
              What is different
            </DisclosureTrigger>
            <DisclosurePanel>
              <ul className="dm-welcome-list">
                <li>The menu groups are the ones you know.</li>
                <li>Press / to go anywhere, or to run an action by name.</li>
                <li>
                  The map below has a row for each storage: its disks, then its
                  shared folders and how computers reach them.
                </li>
                <li>
                  Saved changes still wait in the yellow bar until you apply
                  them.
                </li>
              </ul>
            </DisclosurePanel>
          </Disclosure>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onNote("Opens the classic interface in a new tab.");
            }}
          >
            Open the classic interface
            <ExternalLink aria-hidden="true" />
          </Button>
          <Button variant="quiet" size="sm" onClick={onDismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
