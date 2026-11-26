// SPDX-License-Identifier: GPL-3.0-or-later
// Candidate B, "Pointed out in place": one strong statement, and the three things that work
// differently, each pointed out beside the thing itself on the person's own page. Development only
// (UI-11).
//
// The notes sit in the empty side of the region they are about and draw a short line to it: the
// search in the top bar, the answer, and the map (in the map's own tip slot, the place the library
// gives a first-time tip). Nothing covers a control (rethink P.1, R1). Pointing at a note rings the
// thing it is about, so a newcomer can match the words to the place without reading further.
import { Icon, IconBadge } from "@omv-webui/react-ui-components";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { CandidateProps } from "./parts.tsx";
import {
  Answer,
  Foot,
  LabMap,
  NewNasAnswer,
  Steps,
  WelcomeLinks,
} from "./parts.tsx";
import { ANNOTATED, count, fill } from "./words.ts";

type Target = "palette" | "answer" | "steps" | "map";

/** Each note's mark: the thing itself in small, so the eye matches the note to its place. */
const MARKS: Record<Target, ReactNode> = {
  palette: <kbd>/</kbd>,
  answer: (
    <svg viewBox="0 0 24 24">
      <IconBadge status="unknown" cx={12} cy={12} r={10} strokeWidth={1.5} />
    </svg>
  ),
  steps: <Icon name="file-system" mark="create" size={24} />,
  map: <Icon name="nas" size={24} />,
};

function Note({
  target,
  lead,
  body,
  place,
  compact,
  onHot,
}: {
  target: Target;
  lead: string;
  body: string;
  /** `up`: under the top bar's search, its line rising to it. `side`: beside its region. `head`: in the map's header. */
  place: "up" | "side" | "head";
  compact: boolean;
  onHot: (target: Target | null) => void;
}) {
  return (
    <div
      role="note"
      className="wl-note"
      data-place={place}
      data-target={target}
      onPointerEnter={() => {
        onHot(target);
      }}
      onPointerLeave={() => {
        onHot(null);
      }}
    >
      <span className="wl-leader" aria-hidden="true" />
      <span className="wl-note-mark" aria-hidden="true">
        {MARKS[target]}
      </span>
      <p>
        <strong>{lead}</strong>
        {compact ? null : <> {body}</>}
      </p>
    </div>
  );
}

function Region({
  target,
  hot,
  children,
  className,
}: {
  target: Target;
  hot: Target | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`wl-region ${className ?? ""}`}
      data-hot={hot === target || undefined}
    >
      {children}
    </div>
  );
}

export function Annotated(p: CandidateProps) {
  const titleId = useId();
  const [hot, setHot] = useState<Target | null>(null);
  const f = p.nas.facts;
  const host = f.host;
  const folder = f.example?.name ?? "Photos";
  const words = p.newNas ? ANNOTATED.new : ANNOTATED.existing;
  const notes = p.welcome;

  // The search lives in the top bar, outside the page: its ring is set on it from here.
  useEffect(() => {
    const trigger = document.querySelector<HTMLElement>(
      '[data-slot="command-palette-trigger"]',
    );
    if (!trigger) {
      return;
    }
    if (hot === "palette") {
      trigger.dataset.wlHot = "";
    } else {
      delete trigger.dataset.wlHot;
    }
  }, [hot]);

  const firstSentence = (text: string) => text.slice(0, text.indexOf(".") + 1);
  const mapNote = p.newNas ? ANNOTATED.mapNew : ANNOTATED.map;

  return (
    <div
      className="wl-page"
      data-candidate="annotated"
      data-notes={notes || undefined}
      data-assemble={p.assemble ? "full" : undefined}
    >
      {p.welcome ? (
        <section className="wl-hero wl-b" aria-labelledby={titleId}>
          <div className="wl-b-statement">
            <h1 id={titleId} className="wl-display" tabIndex={-1}>
              {fill(words.title, { host })}
            </h1>
            <p className="wl-lead">
              {p.compact
                ? fill(firstSentence(words.lead), { host })
                : fill(words.lead, { host })}
            </p>
            <WelcomeLinks onHide={p.onHide} />
          </div>
          <Note
            target="palette"
            place="up"
            compact={p.compact}
            lead={ANNOTATED.palette.lead}
            body={fill(ANNOTATED.palette.body, { folder })}
            onHot={setHot}
          />
        </section>
      ) : null}

      {p.newNas ? (
        <div className="wl-b-row">
          <Region target="steps" hot={hot}>
            {p.welcome ? null : <NewNasAnswer />}
            <Steps accent="filled" onNote={p.onNote} />
          </Region>
          {notes ? (
            <Note
              target="steps"
              place="side"
              compact={p.compact}
              lead={ANNOTATED.steps.lead}
              body={ANNOTATED.steps.body}
              onHot={setHot}
            />
          ) : null}
        </div>
      ) : (
        <div className="wl-b-row">
          <Region target="answer" hot={hot}>
            <Answer
              nas={p.nas}
              check={p.check}
              onCheck={p.onCheck}
              level={p.welcome ? 2 : 1}
              size={p.welcome ? "title" : "display"}
              place="inline"
            />
          </Region>
          {notes ? (
            <Note
              target="answer"
              place="side"
              compact={p.compact}
              lead={ANNOTATED.answer.lead}
              body={ANNOTATED.answer.body}
              onHot={setHot}
            />
          ) : null}
        </div>
      )}

      <Region target="map" hot={hot}>
        <LabMap
          nas={p.nas}
          newNas={p.newNas}
          captions={p.welcome && !p.compact}
          example={p.tips || p.welcome}
          assemble={p.assemble}
          check={p.check}
          onCheck={p.onCheck}
          checkInFooter={p.newNas}
          addStorageAccent={false}
          onNote={p.onNote}
          tip={
            notes ? (
              <Note
                target="map"
                place="head"
                compact={p.compact}
                lead={mapNote.lead}
                body={fill(mapNote.body, {
                  folder,
                  free: count(f.unused.length),
                })}
                onHot={setHot}
              />
            ) : undefined
          }
        />
      </Region>
      <Foot onShowAround={p.onShowAround} />
    </div>
  );
}
