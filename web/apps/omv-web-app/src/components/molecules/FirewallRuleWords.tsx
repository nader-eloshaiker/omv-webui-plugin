// SPDX-License-Identifier: GPL-3.0-or-later
// A firewall rule in plain words (phase 5 network design 11.3, 11.10, D20): the parts of a row that
// network/ruleWords.ts names as copy keys, turned into sentences. Addresses, ports and values set in
// the classic interface are text in the mono face, isolated (UI-2); a rule's own note is text.
import { IsolatedIdentifier } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type {
  ActionWord,
  DirectionWord,
  KindWord,
  NoteWord,
  PortWord,
  RuleRow,
} from "../../network/ruleWords.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { WhoWords } from "./FirewallWhoList.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** "{{value}} (set in the classic interface)". */
function Classic({ value }: { value: string }) {
  return (
    <Trans
      i18nKey="fwRule.classicValue"
      components={{ value: <Value value={value} /> }}
    />
  );
}

export function ActionWords({ word }: { word: ActionWord }): ReactNode {
  const { t } = useTranslation();
  return word.key === "fwRule.classicValue" ? (
    <Classic value={word.value} />
  ) : (
    t(word.key)
  );
}

function DirectionWords({ word }: { word: DirectionWord }): ReactNode {
  const { t } = useTranslation();
  return word.key === "fwRule.classicValue" ? (
    <Classic value={word.value} />
  ) : (
    t(word.key)
  );
}

function KindWords({ word }: { word: KindWord }): ReactNode {
  const { t } = useTranslation();
  return word.key === "firewall.kind.classic" ? (
    <Trans
      i18nKey="firewall.kind.classic"
      components={{ kind: <Value value={word.kind} /> }}
    />
  ) : (
    t(word.key)
  );
}

export function PortWords({ word }: { word: PortWord }): ReactNode {
  const { t } = useTranslation();
  switch (word.key) {
    case "firewall.port_one": {
      const port = (
        <Trans
          i18nKey="firewall.port_one"
          components={{ port: <NodeSlot value={String(word.port)} /> }}
        />
      );
      return word.service === null ? (
        port
      ) : (
        <Trans
          i18nKey="firewall.portNamed"
          components={{
            port: <NodeSlot value={port} />,
            name: <NodeSlot value={t(word.service)} />,
          }}
        />
      );
    }
    case "firewall.portRange":
      return (
        <Trans
          i18nKey="firewall.portRange"
          components={{
            from: <NodeSlot value={String(word.from)} />,
            to: <NodeSlot value={String(word.to)} />,
          }}
        />
      );
    case "fwRule.classicValue":
      return <Classic value={word.value} />;
  }
}

/** "Coming in, TCP to port 22 (SSH)" (11.3 column 3). */
export function TrafficWords({
  traffic,
}: {
  traffic: RuleRow["traffic"];
}): ReactNode {
  const components = {
    direction: <NodeSlot value={<DirectionWords word={traffic.direction} />} />,
    kind: <NodeSlot value={<KindWords word={traffic.kind} />} />,
  };
  return traffic.port === null ? (
    <Trans i18nKey="firewall.traffic" components={components} />
  ) : (
    <Trans
      i18nKey="firewall.trafficPort"
      components={{
        ...components,
        port: <NodeSlot value={<PortWords word={traffic.port} />} />,
      }}
    />
  );
}

/** The other computer, the NAS's side when set, and the other computer's port when set (11.3 column 4). */
export function PeerWords({ row }: { row: RuleRow }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        <WhoWords word={row.who} />
        {row.nasSide === null ? null : (
          <>
            {" "}
            <Trans
              i18nKey="firewall.who.nasSide"
              components={{
                address: (
                  <NodeSlot value={<WhoWords word={row.nasSide.address} />} />
                ),
              }}
            />
          </>
        )}
      </span>
      {row.otherPort === null ? null : (
        <span className="text-sm text-muted-foreground">
          <Trans
            i18nKey="firewall.otherPort"
            components={{ value: <Value value={row.otherPort.value} /> }}
          />
        </span>
      )}
    </span>
  );
}

function OptionWords({ word }: { word: NoteWord }): ReactNode {
  const { t } = useTranslation();
  return word.key === "firewall.note.classic" ? (
    <Trans
      i18nKey="firewall.note.classic"
      components={{ options: <Value value={word.options} /> }}
    />
  ) : (
    t(word.key)
  );
}

/** The rule's note, then 11.6's words or other options set in the classic interface (11.3 column 5). */
export function NoteWords({ row }: { row: RuleRow }) {
  const comment = row.comment.trim();
  if (comment === "" && row.options === null) {
    return null;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {comment === "" ? null : <bdi>{inertBidi(row.comment)}</bdi>}
      {row.options === null ? null : (
        <span>
          <OptionWords word={row.options} />
        </span>
      )}
    </span>
  );
}

/** A whole rule in one line, for a dialog or the change summary. */
export function RuleSentence({ row }: { row: RuleRow }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        <ActionWords word={row.then} />
        {": "}
        <TrafficWords traffic={row.traffic} />
      </span>
      <PeerWords row={row} />
      <span className="text-sm text-muted-foreground">
        <NoteWords row={row} />
      </span>
    </span>
  );
}
