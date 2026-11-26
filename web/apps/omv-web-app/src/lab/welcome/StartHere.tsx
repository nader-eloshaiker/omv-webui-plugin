// SPDX-License-Identifier: GPL-3.0-or-later
// Candidate C, "Start the work": the welcome turns into the start of the work. Development only
// (UI-11).
//
// Beside the greeting and the answer stands a large search for any page, setting or task (the
// command palette's own way in, at the size of a first move), and under it the few things this NAS
// suggests right now, each from a read and each with its button. On a new NAS those are the first
// steps. A suggestion that is done leaves the list; on a later visit those that still hold are one
// sentence under the answer, until they are done or tips are off (rethink P.3, G1).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  Icon,
  LeavingItem,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { CandidateProps } from "./parts.tsx";
import {
  Answer,
  Foot,
  LabMap,
  NewNasAnswer,
  Steps,
  WelcomeLinks,
} from "./parts.tsx";
import { COMMON, count, counted, fill, listWords, START } from "./words.ts";

interface Suggestion {
  id: "check" | "unused" | "unreached";
  icon: IconName;
  mark?: "create";
  title: string;
  detail: string;
  action: string;
}

/** What this NAS suggests now, each from a read; none is shown that the reads do not support. */
function suggestionsOf(p: CandidateProps): Suggestion[] {
  const f = p.nas.facts;
  const list: Suggestion[] = [];
  // Smart.getListBg not read since sign-in; DiskMgmt.getList for the count and `powermode`.
  if (p.check !== "after") {
    const asleep = f.asleep.map((d) => d.device);
    list.push({
      id: "check",
      icon: "check-health",
      title: fill(START.check.title, {
        disks: counted(f.disks, "disk", "disks"),
      }),
      detail:
        asleep.length === 0
          ? START.check.awake
          : fill(
              asleep.length === 1 ? START.check.asleep : START.check.asleepMany,
              {
                asleep: listWords(asleep),
              },
            ),
      action: START.check.action,
    });
  }
  // DiskMgmt.getList and FileSystemMgmt.getList: a disk in no storage and in no array.
  const unused = f.unused[0];
  if (unused) {
    list.push({
      id: "unused",
      icon: "file-system",
      mark: "create",
      title: fill(START.unused.title, { device: unused.device }),
      detail: fill(START.unused.detail, {
        size: unused.sizeText,
        kind:
          unused.kind === "ssd"
            ? "SSD"
            : unused.kind === "hdd"
              ? "hard disk"
              : "disk",
        host: f.host,
      }),
      action: START.unused.action,
    });
  }
  // ShareMgmt.getList with SMB.getShareList and NFS.getShareList: a folder in neither.
  const unreached = f.unreached[0];
  if (unreached) {
    list.push({
      id: "unreached",
      icon: "share",
      title: fill(START.unreached.title, { folder: unreached.name }),
      detail: START.unreached.detail,
      action: fill(START.unreached.action, { folder: unreached.name }),
    });
  }
  return list;
}

/**
 * The later visit's sentence of what still holds, without the check (the answer holds it): "You
 * could also put sde to use, or let computers open a4share.", each phrase a text button that opens
 * its page.
 */
function AlsoSentence({ p }: { p: CandidateProps }) {
  const f = p.nas.facts;
  const parts = [
    ...(f.unused[0]
      ? [
          {
            id: "unused",
            words: fill(START.alsoUnused, { device: f.unused[0].device }),
            opens: "Add storage",
          },
        ]
      : []),
    ...(f.unreached[0]
      ? [
          {
            id: "unreached",
            words: fill(START.alsoUnreached, { folder: f.unreached[0].name }),
            opens: `Share ${f.unreached[0].name}`,
          },
        ]
      : []),
  ];
  if (parts.length === 0) {
    return null;
  }
  const phrase = (part: (typeof parts)[number]) => (
    <button
      key={part.id}
      type="button"
      className="wl-inline-action"
      onClick={() => {
        p.onNote(`Opens ${part.opens}.`);
      }}
    >
      {part.words}
    </button>
  );
  // START.also is "You could also {{list}}.", the phrases joined by START.alsoOr.
  const [before, after] = START.also.split("{{list}}");
  const [first, second] = parts;
  return (
    <p className="wl-also">
      {before}
      {first ? phrase(first) : null}
      {second ? (
        <>
          {START.alsoOr}
          {phrase(second)}
        </>
      ) : null}
      {after}
    </p>
  );
}

function SearchField({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="wl-field"
      aria-label={START.field}
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={onOpen}
    >
      <Search aria-hidden="true" />
      <span aria-hidden="true" className="wl-field-words">
        {START.field}
      </span>
      <kbd aria-hidden="true">/</kbd>
    </button>
  );
}

export function StartHere(p: CandidateProps) {
  const titleId = useId();
  const listId = useId();
  const f = p.nas.facts;
  const host = f.host;
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const all = suggestionsOf(p).filter((s) => !done.has(s.id));
  // The list keeps its identity while its words stay the same, so the leaving rows are found by
  // comparing lists, not by every render's new array.
  const sig = all.map((s) => `${s.id}:${s.title}:${s.detail}`).join("|");
  const [stable, setStable] = useState(() => ({ sig, list: all }));
  if (stable.sig !== sig) {
    setStable({ sig, list: all });
  }
  const { entries, left } = useLeavingItems(
    stable.sig === sig ? stable.list : all,
    (s) => s.id,
  );

  // When every suggestion is done, the welcome has done its work and folds away by itself.
  const empty = !p.newNas && p.welcome && entries.length === 0;
  const { onHide } = p;
  useEffect(() => {
    if (empty) {
      onHide();
    }
  }, [empty, onHide]);

  const act = (s: Suggestion) => {
    if (s.id === "check") {
      p.onCheck();
      return;
    }
    p.onNote(`Opens ${s.action}.`);
    setDone((d) => new Set([...d, s.id]));
  };

  const lead = p.newNas
    ? fill(START.new.lead, { free: count(f.unused.length) })
    : START.existing.lead;
  const also = p.tips && !p.welcome && !p.newNas;

  return (
    <div className="wl-page" data-candidate="start">
      {p.welcome ? (
        <section className="wl-hero wl-c" aria-labelledby={titleId}>
          <div className="wl-c-words">
            <h1 id={titleId} className="wl-display" tabIndex={-1}>
              {fill(START.title, { host })}
            </h1>
            <p className="wl-lead">{lead}</p>
            {p.newNas ? (
              // A new NAS has no answer to give yet: the search stands under the greeting and
              // the first steps take the other column.
              <div className="wl-c-answer">
                <SearchField onOpen={p.onOpenPalette} />
              </div>
            ) : (
              <Answer
                nas={p.nas}
                check={p.check}
                onCheck={p.onCheck}
                level={2}
                size="title"
                place="none"
                className="wl-c-answer"
              />
            )}
            <WelcomeLinks onHide={p.onHide} />
          </div>
          <div className="wl-c-work">
            {p.newNas ? null : <SearchField onOpen={p.onOpenPalette} />}
            {p.newNas ? (
              <Steps accent="filled" onNote={p.onNote} />
            ) : (
              <section className="wl-start" aria-labelledby={listId}>
                <h2 id={listId} className="wl-start-title">
                  {fill(START.suggestions, { host })}
                </h2>
                <ul className="wl-start-list">
                  {entries.map((e) => (
                    <LeavingItem
                      key={e.key}
                      leaving={e.leaving}
                      onLeft={() => {
                        left(e.key);
                      }}
                    >
                      <div className="wl-start-row">
                        <Icon name={e.item.icon} mark={e.item.mark} size={24} />
                        <div className="wl-start-words">
                          <p className="wl-start-name">{e.item.title}</p>
                          {p.compact ? null : (
                            <p className="wl-start-detail">{e.item.detail}</p>
                          )}
                        </div>
                        <Button
                          variant={
                            e.item.id === "check" ? "primaryOutline" : "neutral"
                          }
                          size="sm"
                          loading={
                            e.item.id === "check" && p.check === "checking"
                          }
                          onClick={() => {
                            act(e.item);
                          }}
                        >
                          {e.item.id === "check" && p.check === "checking"
                            ? COMMON.checking
                            : e.item.action}
                        </Button>
                      </div>
                    </LeavingItem>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
      ) : null}

      {p.newNas ? (
        p.welcome ? null : (
          <>
            <NewNasAnswer />
            <Steps accent="filled" onNote={p.onNote} />
          </>
        )
      ) : p.welcome ? null : (
        <Answer
          nas={p.nas}
          check={p.check}
          onCheck={p.onCheck}
          level={1}
          size="display"
          place="below"
          after={also ? <AlsoSentence p={p} /> : undefined}
        />
      )}

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
      />
      <Foot onShowAround={p.onShowAround} />
    </div>
  );
}
