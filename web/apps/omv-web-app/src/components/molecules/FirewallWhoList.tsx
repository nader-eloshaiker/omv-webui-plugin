// SPDX-License-Identifier: GPL-3.0-or-later
// The computers a firewall check found the rules may block this page for (phase 5 network design
// 11.5 `{{who}}`): each in 0.2's words, at most three, then "and {{count}} more". Used by the change
// flow's effect line and the band's firewall line (1.8). Addresses are text in the mono face (UI-2).
import { IsolatedIdentifier } from "@omv-webui/react-ui-components";
import { Fragment, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { Recorded } from "../../network/firewallCheck.ts";
import { whoList, type WhoWord } from "../../network/ruleWords.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/**
 * One rule's computers in 0.2's words. `inline` gives the form that sits inside a sentence ("for
 * the computer at …"), which starts with a small letter; the list's own column starts with a capital.
 */
export function WhoWords({
  word,
  inline = false,
}: {
  word: WhoWord;
  inline?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  switch (word.key) {
    case "firewall.who.any":
      return t(inline ? "firewall.whoInline.any" : "firewall.who.any");
    case "firewall.who.one":
      return (
        <Trans
          i18nKey={inline ? "firewall.whoInline.one" : "firewall.who.one"}
          components={{ address: <Value value={word.address} /> }}
        />
      );
    case "firewall.who.network":
      return word.count.kind === "huge" ? (
        <Trans
          i18nKey={
            inline
              ? "firewall.whoInline.networkHuge"
              : "firewall.who.networkHuge"
          }
          components={{ network: <Value value={word.network} /> }}
        />
      ) : (
        <Trans
          i18nKey={
            inline ? "firewall.whoInline.network" : "firewall.who.network"
          }
          components={{
            network: <Value value={word.network} />,
            count: <NodeSlot value={word.count.count.toLocaleString("en")} />,
          }}
        />
      );
    case "firewall.who.range":
      return (
        <Trans
          i18nKey={inline ? "firewall.whoInline.range" : "firewall.who.range"}
          components={{
            first: <Value value={word.first} />,
            last: <Value value={word.last} />,
          }}
        />
      );
    case "firewall.who.except":
      return (
        <Trans
          i18nKey={inline ? "firewall.whoInline.except" : "firewall.who.except"}
          components={{ who: <WhoWords word={word.who} inline /> }}
        />
      );
    case "fwRule.classicValue":
      return (
        <Trans
          i18nKey="fwRule.classicValue"
          components={{ value: <Value value={word.value} /> }}
        />
      );
  }
}

/** The NAS's own side of a rule as the bare address, network or range it names. */
function NasSide({ word }: { word: WhoWord }): ReactNode {
  switch (word.key) {
    case "firewall.who.one":
      return <Value value={word.address} />;
    case "firewall.who.network":
      return <Value value={word.network} />;
    case "firewall.who.range":
      return <Value value={`${word.first}-${word.last}`} />;
    default:
      return <WhoWords word={word} />;
  }
}

/** "The computer at 192.0.2.10, Computers on 198.51.100.0/24 (256 addresses) and 2 more". */
export function FirewallWhoList({
  recorded,
}: {
  recorded: readonly Recorded[];
}) {
  const { t } = useTranslation();
  const { shown, more } = whoList(recorded);
  return (
    <>
      {shown.map((entry, i) => (
        <Fragment key={JSON.stringify(entry)}>
          {i > 0 ? ", " : null}
          <WhoWords word={entry.who} inline />
          {entry.nasSide === null ? null : (
            <>
              {" "}
              <Trans
                i18nKey="firewall.who.nasSide"
                components={{
                  address: <NasSide word={entry.nasSide.address} />,
                }}
              />
            </>
          )}
        </Fragment>
      ))}
      {more > 0 ? <> {t("firewall.who.more", { count: more })}</> : null}
    </>
  );
}
