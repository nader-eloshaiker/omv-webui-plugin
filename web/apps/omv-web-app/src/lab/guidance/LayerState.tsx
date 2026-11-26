// SPDX-License-Identifier: GPL-3.0-or-later
// Layer G1 (rethink P.3, 6.8), guidance from the state of the NAS: on a new NAS the dashboard's
// answer welcomes, First steps sit under it, the map shows the unused disks ending in a ghost "Add
// storage", an example row and the column captions; a page with no shared folders teaches with a
// ghost row. Each ends when the NAS changes, for every administrator. With tips off the empty
// places keep their sentence and action but drop the example and the caption, and First steps
// become Shortcuts. Compact density drops the steps' explanations and the captions (owner decision
// 11). Development only (UI-11): the dashboard's and the table's own lab parts.
import { Icon, useShowTips } from "@omv-webui/react-ui-components";
import { useMemo, useRef, useState } from "react";
import { FirstSteps, Shortcuts } from "../dashboard/Footer.tsx";
import type { Nas } from "../dashboard/model.ts";
import {
  accentAt,
  answerOf,
  layoutFor,
  mapView,
  nasFor,
  stepActionsShown,
  withFirstStorage,
} from "../dashboard/model.ts";
import { SystemMap } from "../dashboard/SystemMap.tsx";
import { FoldersTable, LabCauses } from "../tables/FoldersTable.tsx";
import { captionsFor } from "./guidanceModel.ts";
import { Region, Specimen } from "./Region.tsx";
import { useContentWidth } from "./useContentWidth.ts";

function NewNas({
  compact,
  chrome,
  onNote,
}: {
  compact: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const [tips] = useShowTips();
  const [nas, setNas] = useState<Nas>(() => nasFor("new-nas"));
  const frameRef = useRef<HTMLDivElement | null>(null);
  const layout = layoutFor(useContentWidth(frameRef));
  const view = useMemo(() => mapView(nas), [nas]);
  const answer = answerOf(nas);
  const stepsShown = tips && nas.steps.some((s) => !s.done);
  const accent = accentAt(nas, stepsShown);
  const hasStorage = nas.storage.some((s) => s.id === "s:data");
  return (
    <div ref={frameRef} className="g-dash" data-layout={layout}>
      {chrome ? (
        <LabCauses>
          <button
            type="button"
            disabled={hasStorage}
            onClick={() => {
              setNas((n) => withFirstStorage(n));
            }}
          >
            Storage is added
          </button>
          <button
            type="button"
            disabled={!hasStorage}
            onClick={() => {
              setNas(nasFor("new-nas"));
            }}
          >
            Back to a new NAS
          </button>
        </LabCauses>
      ) : null}
      <div className="dm-answer g-answer">
        <span aria-hidden="true" className="dm-answer-mark">
          <Icon name="nas" size={24} motion="none" />
        </span>
        <div className="dm-answer-words">
          <p className="dm-answer-title">{answer.title}</p>
          <p className="dm-answer-reason">{answer.reason}</p>
        </div>
      </div>
      {stepsShown ? (
        <FirstSteps
          steps={nas.steps}
          filled={accent === "step"}
          placement="top"
          compact={compact}
          onNote={onNote}
        />
      ) : (
        <Shortcuts steps={nas.steps} onNote={onNote} />
      )}
      <SystemMap
        idPrefix="g-new"
        nas={nas}
        view={view}
        layout={layout}
        loading={false}
        accent={accent}
        assemble="none"
        captions={captionsFor(nas, tips, compact)}
        example={tips}
        arrival={null}
        showTraceTip={false}
        onTraced={() => undefined}
        onDismissTip={() => undefined}
        stepActions={stepActionsShown(nas.steps, stepsShown)}
        retrying={[]}
        onRetry={() => undefined}
        onNote={onNote}
      />
    </div>
  );
}

export function LayerState({
  compact,
  chrome,
  onNote,
}: {
  compact: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const [tips] = useShowTips();
  return (
    <Region
      title="Guidance from the state of the NAS"
      what="Example rows, column captions and first steps show while the NAS has nothing of that kind yet, and end by themselves the moment it has."
      tipsOff="With Show tips off, empty places keep their sentence and action but drop the example and the caption, and First steps become Shortcuts."
    >
      <Specimen title="The dashboard of a new NAS">
        <NewNas compact={compact} chrome={chrome} onNote={onNote} />
      </Specimen>
      <Specimen title="Shared folders, before there are any">
        <FoldersTable
          state="empty"
          tips={tips}
          chrome={chrome}
          onNote={onNote}
        />
      </Specimen>
    </Region>
  );
}
