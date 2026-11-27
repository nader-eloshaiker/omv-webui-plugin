// SPDX-License-Identifier: GPL-3.0-or-later
// Layer G3 (rethink P.3, 3.8), help when asked: "Which should I choose?" beside a choice, the (?)
// beside a label, and a technical term that opens what it means. None opens by itself and none
// fades. With tips off each disclosure folds into its (?) icon, with the same name. Development
// only (UI-11).
import {
  Field,
  FieldControl,
  FieldLabel,
  GlossaryTerm,
  HelpDisclosure,
  HelpPopover,
  RadioGroupField,
  RadioOption,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { Region, Specimen } from "./Region.tsx";
import { termLabel } from "./tipWords.ts";

export function LayerHelp() {
  const [how, setHow] = useState("smb");
  return (
    <Region
      title="Help when asked"
      what="Which choice to make, what a setting is and what a technical term means are answered when the person asks, and nothing here opens by itself or fades."
      tipsOff="With Show tips off, each Which should I choose? folds into its (?) icon, with the same name and the same answer."
    >
      <div className="g-row">
        <Specimen title="A choice">
          <div className="g-choice">
            <RadioGroupField
              legend="How will computers reach it?"
              value={how}
              onValueChange={setHow}
            >
              <RadioOption
                value="smb"
                label="Windows and Mac"
                hint="Every computer in the house can open it."
              />
              <RadioOption
                value="nfs"
                label="Linux and media players"
                hint="For Linux computers and TV boxes that ask for NFS."
              />
            </RadioGroupField>
            <HelpDisclosure question="Which should I choose?">
              <p>
                Choose Windows and Mac unless a device asks for NFS. Windows,
                Mac, phones and most TV boxes open it.
              </p>
              <p>
                Linux and media players suits Linux computers and players such
                as Kodi set up for NFS. You can turn on both later on the
                folder's page.
              </p>
            </HelpDisclosure>
          </div>
        </Specimen>
        <Specimen title="A setting and a term">
          <div className="g-term-specimen">
            <Field className="g-field">
              <div className="g-label-row">
                <FieldLabel>Workgroup</FieldLabel>
                <HelpPopover label="What is a workgroup?">
                  <p>
                    The name Windows computers use to find each other on a home
                    network. Windows uses WORKGROUP unless someone changed it,
                    so most homes keep it.
                  </p>
                </HelpPopover>
              </div>
              <FieldControl width="name" defaultValue="WORKGROUP" />
            </Field>
            <p className="g-specimen-line">
              Windows and Mac sharing (
              <GlossaryTerm term="SMB" label={termLabel("SMB")}>
                Server Message Block, the way Windows and Mac computers open
                folders over a network. Forum answers about Samba mean the same
                thing.
              </GlossaryTerm>
              ) is on for the whole NAS.
            </p>
          </div>
        </Specimen>
      </div>
    </Region>
  );
}
