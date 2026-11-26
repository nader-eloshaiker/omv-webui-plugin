// SPDX-License-Identifier: GPL-3.0-or-later
// Candidate A, "Your NAS, drawn": the welcome is the person's own NAS drawn large, assembling once.
// Development only (UI-11).
//
// The headline greets the NAS by its name and the lead counts what is in it, from the reads. Beside
// it, the NAS's front: every disk by its kind in a bay, the NVMe stick on the mainboard, and under
// the chassis the drives the disks make. On the first visit the disks drop into their bays and the
// brackets draw; the map under it is already there, so only one thing assembles. On a later visit a
// small copy of the drawing stands beside the answer, and a disk health check draws its result on it.
import { useId } from "react";
import type { CandidateProps } from "./parts.tsx";
import {
  Answer,
  Foot,
  LabMap,
  NasFront,
  NewNasAnswer,
  Steps,
  WelcomeLinks,
} from "./parts.tsx";
import { count, counted, DRAWN, fill } from "./words.ts";

export function Drawn(p: CandidateProps) {
  const titleId = useId();
  const f = p.nas.facts;
  const host = f.host;
  const words = p.newNas
    ? {
        lead: fill(DRAWN.new.lead, {
          disks: counted(f.disks, "disk", "disks"),
          free: count(f.unused.length),
        }),
        more: DRAWN.new.more,
      }
    : {
        lead: fill(DRAWN.existing.lead, {
          disks: counted(f.disks, "disk", "disks"),
          drives: counted(f.drives, "drive", "drives"),
          folders: counted(f.folders, "shared folder", "shared folders"),
        }),
        more: fill(DRAWN.existing.more, { host }),
      };

  return (
    <div className="wl-page" data-candidate="drawn">
      {p.welcome ? (
        <section
          className="wl-hero wl-a"
          aria-labelledby={titleId}
          data-assemble={p.assemble ? "full" : undefined}
        >
          <div className="wl-a-words">
            <h1 id={titleId} className="wl-display" tabIndex={-1}>
              {fill(DRAWN.title, { host })}
            </h1>
            <p className="wl-lead">{words.lead}</p>
            {p.compact ? null : <p className="wl-more">{words.more}</p>}
            <WelcomeLinks onHide={p.onHide} />
          </div>
          <NasFront
            nas={p.nas}
            newNas={p.newNas}
            size="large"
            assemble={p.assemble}
          />
        </section>
      ) : null}

      {p.newNas ? (
        <>
          {p.welcome ? null : <NewNasAnswer />}
          <Steps accent="filled" onNote={p.onNote} />
        </>
      ) : (
        <Answer
          nas={p.nas}
          check={p.check}
          onCheck={p.onCheck}
          level={p.welcome ? 2 : 1}
          size={p.welcome ? "title" : "display"}
          place="beside"
          aside={
            p.welcome ? undefined : (
              <NasFront
                nas={p.nas}
                newNas={false}
                size="small"
                assemble={false}
                checked={p.check === "after"}
                landed={p.landed}
              />
            )
          }
        />
      )}

      <LabMap
        nas={p.nas}
        newNas={p.newNas}
        captions={p.welcome && !p.compact}
        example={p.tips || p.welcome}
        assemble={false}
        check={p.check}
        onCheck={p.onCheck}
        checkInFooter={p.newNas}
        addStorageAccent={false}
        onNote={p.onNote}
      />
      <Foot onShowAround={p.onShowAround} />
    </div>
  );
}
