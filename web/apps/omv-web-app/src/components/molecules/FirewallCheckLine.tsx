// SPDX-License-Identifier: GPL-3.0-or-later
// What the rules do to this page (phase 5 network design 11.3 item 3, 11.5): "The rules let this page
// in." with the neutral Monitor icon, or the warning-shape neutral InlineAlert with the finding (never
// red: a rule is a setting, D8), then the check's lines (the same network, the other web address,
// SSH, a list this page does not use). A status: it changes as the list shown or a dialog's fields
// change, and is read politely. The computers named come from the rules: text, isolated (UI-2).
import {
  InlineAlert,
  IsolatedIdentifier,
} from "@omv-webui/react-ui-components";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { CheckLine, ListCheck } from "../../network/firewallCheck.ts";
import { verdictWords } from "../../network/ruleWords.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { FirewallWhoList } from "./FirewallWhoList.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

export function CheckLineWords({ line }: { line: CheckLine }): ReactNode {
  const { t } = useTranslation();
  switch (line.code) {
    case "firewall.sameNetwork":
      return (
        <Trans
          i18nKey="firewall.sameNetwork"
          components={{ network: <Value value={line.network} /> }}
        />
      );
    case "firewall.otherScheme":
      return (
        <Trans
          i18nKey="firewall.otherScheme"
          components={{
            scheme: <Value value={`${line.scheme}://`} />,
            current: <Value value={`${line.current}://`} />,
          }}
        />
      );
    case "firewall.sshSome":
      return (
        <Trans
          i18nKey="firewall.sshSome"
          components={{
            who: <NodeSlot value={<FirewallWhoList recorded={line.who} />} />,
          }}
        />
      );
    case "firewall.ipv6Page":
    case "firewall.ipv4Page":
    case "firewall.sshBlocked":
    case "firewall.sshUnread":
      return t(line.code);
  }
}

/** The verdict's own sentence (11.5's second table). */
export function VerdictSentence({ check }: { check: ListCheck }): ReactNode {
  const { t } = useTranslation();
  const words = verdictWords(check.page.verdict);
  switch (words.key) {
    case "firewall.pageLetIn":
    case "firewall.pageRefused":
      return t(words.key);
    case "firewall.pageOnlySome":
    case "firewall.pageBlockedSome": {
      const verdict = check.page.verdict;
      const who =
        verdict.kind === "onlySome" || verdict.kind === "blockedSome"
          ? verdict.who
          : [];
      return (
        <Trans
          i18nKey={words.key}
          components={{
            who: <NodeSlot value={<FirewallWhoList recorded={who} />} />,
          }}
        />
      );
    }
    case "firewall.pageCannotTell":
      return (
        <Trans
          i18nKey="firewall.pageCannotTell"
          components={{ n: <NodeSlot value={String(words.n)} /> }}
        />
      );
  }
}

export function FirewallCheckLine({
  check,
  id,
  className,
}: {
  check: ListCheck;
  /** For a button's `aria-describedby`: the reason a save is refused or goes through the review. */
  id?: string;
  className?: string;
}) {
  const lines = check.lines;
  const extra =
    lines.length === 0 ? null : (
      <ul className="flex flex-col gap-1 text-sm">
        {lines.map((line, i) => (
          <li key={`${line.code}-${String(i)}`}>
            <CheckLineWords line={line} />
          </li>
        ))}
      </ul>
    );
  const letIn = !check.checked || check.page.verdict.kind === "letIn";
  return (
    <div
      id={id}
      role="status"
      data-slot="firewall-check"
      data-verdict={check.checked ? check.page.verdict.kind : "notChecked"}
      className={className}
    >
      {letIn ? (
        <div className="flex flex-col gap-1">
          {check.checked ? (
            <p className="flex items-start gap-2">
              <Monitor
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <VerdictSentence check={check} />
            </p>
          ) : null}
          {extra === null ? null : (
            <div className={check.checked ? "ps-6" : undefined}>{extra}</div>
          )}
        </div>
      ) : (
        <InlineAlert tone="neutral" icon="warning">
          <span className="flex flex-col gap-1">
            <span>
              <VerdictSentence check={check} />
            </span>
            {extra}
          </span>
        </InlineAlert>
      )}
    </div>
  );
}
