// SPDX-License-Identifier: GPL-3.0-or-later
// Layer G0 (rethink P.3), the interface itself: a field and its one-line hint, a consequence
// summary, status words and an empty list's sentence and action. They are not guidance, so "Show
// tips" changes none of them. Development only (UI-11); lab fixtures, plausible and consistent with
// the map's (Data drive 92 % used, 290 GiB free).
import {
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldHint,
  FieldLabel,
  Icon,
  StatusLabel,
} from "@omv-webui/react-ui-components";
import type { Sentence } from "../forms/model.ts";
import { ConsequenceList } from "../forms/parts.tsx";
import { Region, Specimen } from "./Region.tsx";

const SUMMARY: Sentence[] = [
  {
    id: "made",
    icon: "made",
    parts: [
      "",
      "Photos",
      " is made on ",
      "Data drive",
      ", which has 290 GiB free.",
    ],
  },
  {
    id: "smb",
    icon: "smb",
    parts: [
      "Windows computers open it at ",
      "\\\\nas\\Photos",
      ", Macs at ",
      "smb://nas/Photos",
      ".",
    ],
    copy: { text: "\\\\nas\\Photos", label: "Copy the Windows address" },
  },
  {
    id: "effect",
    icon: "effect",
    parts: ["Nothing changes until you press ", "Create Photos", "."],
  },
];

export function LayerInterface({ onNote }: { onNote: (text: string) => void }) {
  return (
    <Region
      title="The interface itself"
      what="Plain labels, the hint under a field, what a button will do, status words and the sentence of an empty list are the interface, not guidance."
      tipsOff="Turning off Show tips changes none of them."
    >
      <div className="g-row">
        <Specimen title="A field and its hint">
          <Field className="g-field">
            <FieldLabel>Name</FieldLabel>
            <FieldControl width="name" defaultValue="Photos" />
            <FieldHint>
              What your computers show for this folder. You can change it later
              on the folder's page.
            </FieldHint>
          </Field>
        </Specimen>
        <Specimen title="What the button will do">
          <ConsequenceList sentences={SUMMARY} />
        </Specimen>
      </div>
      <div className="g-row">
        <Specimen title="Status words">
          <dl className="g-facts">
            <div className="g-fact">
              <dt>Data drive</dt>
              <dd>
                <StatusLabel status="warning">Almost full</StatusLabel>
                <span className="g-fact-more">92 % used, 290 GiB free</span>
              </dd>
            </div>
            <div className="g-fact">
              <dt>System drive</dt>
              <dd>
                <StatusLabel status="ok">OK</StatusLabel>
              </dd>
            </div>
            <div className="g-fact">
              <dt>
                Disk <span className="g-mono">sdc</span>
              </dt>
              <dd>
                <StatusLabel status="unknown">Not checked yet</StatusLabel>
              </dd>
            </div>
          </dl>
        </Specimen>
        <Specimen title="An empty list">
          <EmptyState
            className="g-empty"
            icon={<Icon name="person" size={24} motion="none" />}
            action={
              <Button
                variant="neutral"
                onClick={() => {
                  onNote("Add a person opens its page.");
                }}
              >
                <Icon name="person" mark="create" size={16} />
                Add a person
              </Button>
            }
          >
            Nobody else has an account on this NAS yet. Add a person so they can
            open your shared folders.
          </EmptyState>
        </Specimen>
      </div>
    </Region>
  );
}
