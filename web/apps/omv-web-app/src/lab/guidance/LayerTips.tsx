// SPDX-License-Identifier: GPL-3.0-or-later
// Layer G2 (rethink P.3, P.2, 6.8), tips for the first time: the welcome on an existing NAS, the
// line after a first save, the palette field's placeholder and the map's tracing tip. Each shows
// until its first success or "Got it", this browser remembers it, and only one is on screen at a
// time: the first in reading order, then the next once it has gone. With tips off none shows.
// Each specimen has a cause the owner can press, so the first success can be seen ending its tip.
// Development only (UI-11).
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Field,
  FieldControl,
  FieldHint,
  FieldLabel,
  Icon,
  PendingBand,
  StatusIcon,
} from "@omv-webui/react-ui-components";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SeenKey } from "../../stores/useSeenStore.ts";
import { hasSeen, useSeenStore } from "../../stores/useSeenStore.ts";
import {
  accentAt,
  answerOf,
  layoutFor,
  mapView,
  nasFor,
  stepActionsShown,
} from "../dashboard/model.ts";
import { SystemMap } from "../dashboard/SystemMap.tsx";
import { LabCauses } from "../tables/FoldersTable.tsx";
import type { TipState } from "./guidanceModel.ts";
import { tipState } from "./guidanceModel.ts";
import { Tip } from "./parts/Tip.tsx";
import { endTip, useCurrentTip, useShowTips } from "./parts/tipsContext.ts";
import { Region, Specimen } from "./Region.tsx";
import { useContentWidth } from "./useContentWidth.ts";

const STATE_WORDS: Record<TipState, string> = {
  showing: "This tip is on screen now.",
  waiting:
    "This tip waits: another is on screen, and only one shows at a time.",
  ended: "This tip has ended; this browser remembers it until Start over.",
  "not-yet": "This tip shows after the first save.",
  off: "Tips are off, so this tip does not show.",
};

function TipStateLine({ id, when = true }: { id: SeenKey; when?: boolean }) {
  const [show] = useShowTips();
  const seen = useSeenStore(hasSeen(id));
  const current = useCurrentTip();
  return (
    <span className="g-tip-state">
      {STATE_WORDS[tipState({ id, show, seen, when, current })]}
    </span>
  );
}

// ─── The welcome on an existing NAS (P.2) ─────────────────────────────────────────────────────

function Welcome({
  compact,
  chrome,
  onNote,
}: {
  compact: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const answer = answerOf(nasFor("all-ok"));
  return (
    <Specimen title="The welcome, on an existing NAS">
      {chrome ? (
        <LabCauses>
          <TipStateLine id="tip.new-interface" />
        </LabCauses>
      ) : null}
      <Tip
        id="tip.new-interface"
        about="the new interface"
        icon={<Icon name="nas" size={20} motion="none" />}
        className="g-welcome"
        actions={
          <span className="g-welcome-actions">
            <Disclosure
              open={open}
              onOpenChange={setOpen}
              className="g-welcome-more"
            >
              <DisclosureTrigger variant="inline">
                What is different
              </DisclosureTrigger>
              <DisclosurePanel>
                <ul className="g-welcome-list">
                  <li>The menu groups are the ones you know.</li>
                  <li>Press / to go anywhere, or to run an action by name.</li>
                  <li>
                    The dashboard's map has a row for each storage: its disks,
                    then its shared folders and how computers reach them.
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
          </span>
        }
      >
        Welcome to the new interface.
        {compact
          ? null
          : " Your settings and files are the same; only the way you see them is new."}
      </Tip>
      <div className="dm-answer g-answer">
        <span aria-hidden="true" className="dm-answer-mark">
          <StatusIcon status="ok" />
        </span>
        <div className="dm-answer-words">
          <p className="dm-answer-title">{answer.title}</p>
          <p className="dm-answer-reason">{answer.reason}</p>
        </div>
      </div>
    </Specimen>
  );
}

// ─── After the first save ─────────────────────────────────────────────────────────────────────

type BandState = "closed" | "idle" | "applying" | "applied";

function FirstSave({ chrome }: { chrome: boolean }) {
  const [value, setValue] = useState("WORKGROUP");
  const [saved, setSaved] = useState(false);
  const [band, setBand] = useState<BandState>("closed");
  const timersRef = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const t of timersRef.current) {
        window.clearTimeout(t);
      }
    },
    [],
  );
  const save = () => {
    setSaved(true);
    setBand("idle");
  };
  // Using the yellow bar is the tip's first success.
  const apply = () => {
    endTip("tip.first-save");
    setBand("applying");
    timersRef.current.push(
      window.setTimeout(() => {
        setBand("applied");
      }, 1200),
      window.setTimeout(() => {
        setBand("closed");
      }, 2800),
    );
  };
  const undo = () => {
    endTip("tip.first-save");
    setBand("closed");
    setValue("WORKGROUP");
  };
  return (
    <Specimen title="After the first save" className="g-save">
      {chrome ? (
        <LabCauses>
          <button
            type="button"
            disabled={band !== "closed"}
            onClick={() => {
              setValue(value === "HOME" ? "WORKGROUP" : "HOME");
              save();
            }}
          >
            Save a setting
          </button>
          <button type="button" disabled={band !== "idle"} onClick={apply}>
            Apply the change
          </button>
          <TipStateLine id="tip.first-save" when={saved} />
        </LabCauses>
      ) : null}
      <PendingBand
        label="Pending changes"
        open={band !== "closed"}
        state={band === "closed" ? "idle" : band}
        message="1 change waits to be applied: Windows and Mac sharing."
        applyingMessage="Applying 1 change…"
        appliedMessage="Applied. The NAS uses the new workgroup."
        applyLabel="Apply 1 change"
        undoLabel="Undo 1 change"
        onApply={apply}
        onUndo={undo}
        shrinkOnScroll={false}
      />
      <div className="g-save-form">
        <Field className="g-field">
          <FieldLabel>Workgroup</FieldLabel>
          <FieldControl
            width="name"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
          <FieldHint>
            The name Windows computers look for on your network.
          </FieldHint>
        </Field>
        <div className="g-save-actions">
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </div>
        <Tip id="tip.first-save" when={saved} about="the yellow bar">
          Saved. Your change waits in the yellow bar until you apply it.
        </Tip>
      </div>
    </Specimen>
  );
}

// ─── The palette field ────────────────────────────────────────────────────────────────────────

function PaletteField({
  chrome,
  onOpenPalette,
}: {
  chrome: boolean;
  onOpenPalette: () => void;
}) {
  return (
    <Specimen title="The palette field, in the top bar">
      {chrome ? (
        <LabCauses>
          <button type="button" onClick={onOpenPalette}>
            Open the palette
          </button>
          <TipStateLine id="tip.palette" />
        </LabCauses>
      ) : null}
      <p className="g-specimen-line">
        The field in the top bar reads "Press / to go anywhere" until the
        palette is used for the first time. After that it reads "Go to or do…".
      </p>
    </Specimen>
  );
}

// ─── The map's tracing tip (6.8) ──────────────────────────────────────────────────────────────

function TraceMap({
  chrome,
  onNote,
}: {
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const nas = useMemo(() => nasFor("all-ok"), []);
  const view = useMemo(() => mapView(nas), [nas]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const layout = layoutFor(useContentWidth(frameRef));
  return (
    <Specimen title="The map, on the dashboard">
      {chrome ? (
        <LabCauses>
          <button
            type="button"
            onClick={() => {
              frameRef.current
                ?.querySelector<HTMLElement>('[data-key="f:photos"]')
                ?.focus();
            }}
          >
            Point at Photos
          </button>
          <TipStateLine id="tip.trace" />
        </LabCauses>
      ) : null}
      <div ref={frameRef} className="g-dash" data-layout={layout}>
        <SystemMap
          idPrefix="g-trace"
          nas={nas}
          view={view}
          layout={layout}
          loading={false}
          accent={accentAt(nas, false)}
          assemble="none"
          captions={[]}
          arrival={null}
          showTraceTip={false}
          tip={
            // Pointing needs a pointer or a keyboard; on a narrow touch screen the tip stays away.
            layout === "narrow" ? null : (
              <Tip id="tip.trace" about="pointing at the map">
                Point at a folder, a disk or a way in to see what belongs to it.
              </Tip>
            )
          }
          onTraced={() => {
            endTip("tip.trace");
          }}
          onDismissTip={() => undefined}
          stepActions={stepActionsShown(nas.steps, false)}
          retrying={[]}
          onRetry={() => undefined}
          onNote={onNote}
        />
      </div>
    </Specimen>
  );
}

export function LayerTips({
  compact,
  chrome,
  onNote,
  onOpenPalette,
}: {
  compact: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
  onOpenPalette: () => void;
}) {
  return (
    <Region
      title="Tips for the first time"
      what="A tip is one line beside the thing it explains, shown until the first time the person succeeds at it or presses Got it, one at a time, and this browser remembers each."
      tipsOff="With Show tips off, none of them show."
    >
      <Welcome compact={compact} chrome={chrome} onNote={onNote} />
      <FirstSave chrome={chrome} />
      <PaletteField chrome={chrome} onOpenPalette={onOpenPalette} />
      <TraceMap chrome={chrome} onNote={onNote} />
    </Region>
  );
}
