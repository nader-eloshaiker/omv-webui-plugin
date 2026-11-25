// SPDX-License-Identifier: GPL-3.0-or-later
// Region A, the answer (rethink spec 6.2 A, P.2): one sentence, its reason, and the area chips, each
// the area's icon, name and state, moving focus to its lane. Above it, on an existing NAS seen in the
// new interface for the first time, the one-line welcome. Lab-local candidates for *StatusLine,
// *AreaChip and *WelcomeLine (spec 8 row 1). Development only (UI-11).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Icon,
  IconBadge,
  IconPlate,
  Skeleton,
  StatusIcon,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Answer, AreaId, AreaState } from "./model.ts";

const AREA_ICON: Record<AreaId, IconName> = {
  disks: "disk",
  storage: "file-system",
  folders: "shared-folder",
  sharing: "share",
  network: "net-ethernet",
  system: "nas",
};

/**
 * The answer's mark: the state in its own shape on a 32px plate, the size of the icon set's plate
 * (5.2), so it marks the sentence without outweighing it. Keyed by the state, so a change settles in.
 */
function AnswerMark({
  tone,
  welcome,
}: {
  tone: Answer["tone"];
  welcome: boolean;
}) {
  if (welcome) {
    return <IconPlate name="nas" className="dm-answer-mark" />;
  }
  return (
    <span
      key={tone}
      aria-hidden="true"
      className="dm-answer-mark"
      data-tone={tone}
    >
      <svg viewBox="0 0 24 24">
        <IconBadge status={tone} cx={12} cy={12.5} r={8} strokeWidth={1.5} />
      </svg>
    </span>
  );
}

export function AreaChips({
  areas,
  onChip,
}: {
  areas: readonly AreaState[];
  onChip: (area: AreaState) => void;
}) {
  return (
    <ul className="dm-chips" aria-label="Areas of the NAS">
      {areas.map((area, i) => (
        <li key={area.id}>
          <button
            type="button"
            className="dm-chip"
            data-health={area.health}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => {
              onChip(area);
            }}
          >
            <Icon name={AREA_ICON[area.id]} size={16} motion="none" />
            <span className="dm-chip-name">{area.name}</span>
            {/* Keyed by the state, so a change crossfades and OK's check draws (7.6). */}
            <span key={area.health} className="dm-chip-state">
              {area.empty ? (
                <span className="dm-chip-none">{area.word}</span>
              ) : area.health === "ok" ? (
                <span className="dm-chip-ok">
                  <StatusIcon status="ok" />
                  {area.word}
                </span>
              ) : (
                <StatusPill status={area.health}>{area.word}</StatusPill>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AnswerRegion({
  answer,
  loading,
  welcome,
  chips,
  live,
}: {
  answer: Answer;
  loading: boolean;
  welcome: boolean;
  /** The area chips; left out at 390, where the lane rows carry the same states. */
  chips: ReactNode;
  /** Compact density folds the live readouts into this band (6.3). */
  live: ReactNode;
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
        {/* Keyed by the words, so a change crossfades ("All OK" to "1 thing needs you", 7.6). */}
        <h1
          key={loading ? "loading" : answer.title}
          id="dm-answer-title"
          className="dm-answer-title"
        >
          {loading ? "Reading the NAS…" : answer.title}
        </h1>
        {loading ? null : (
          <p key={answer.reason} className="dm-answer-reason">
            {answer.reason}
          </p>
        )}
      </div>
      {loading ? null : chips}
      {live}
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
