// SPDX-License-Identifier: GPL-3.0-or-later
// The firewall's words where only text can go (phase 5 network design 1.4 item 5): "Copy the current
// settings" for the firewall, the rules in order as plain lines, in the same words as the list. The
// sentences' slots (`<who></who>`) are filled with plain text instead of elements.
import { useTranslation } from "react-i18next";
import type { FirewallRule } from "../network/dto.ts";
import {
  ruleRows,
  type ActionWord,
  type DirectionWord,
  type KindWord,
  type NoteWord,
  type PortNames,
  type PortWord,
  type RuleRow,
  type WhoWord,
} from "../network/ruleWords.ts";

/** A sentence with `<name></name>` (or `<name/>`) slots, filled with plain text. */
export function fillSlots(
  sentence: string,
  slots: Readonly<Record<string, string>>,
): string {
  return sentence.replace(
    /<([a-zA-Z]+)(?:\s*\/>|><\/\1>)/gu,
    (whole, name: string) => slots[name] ?? whole,
  );
}

/** The sentences with slots this file fills. */
type SlotKey =
  | "fwRule.classicValue"
  | "firewall.kind.classic"
  | "firewall.port_one"
  | "firewall.portNamed"
  | "firewall.portRange"
  | "firewall.who.one"
  | "firewall.who.network"
  | "firewall.who.networkHuge"
  | "firewall.who.range"
  | "firewall.who.except"
  | "firewall.who.nasSide"
  | "firewall.traffic"
  | "firewall.trafficPort"
  | "firewall.note.classic"
  | "firewall.otherPort";

export function useFirewallWords() {
  const { t } = useTranslation();
  const fill = (key: SlotKey, slots: Record<string, string>) =>
    fillSlots(t(key), slots);

  const classic = (value: string) => fill("fwRule.classicValue", { value });

  const action = (word: ActionWord): string =>
    word.key === "fwRule.classicValue" ? classic(word.value) : t(word.key);

  const direction = (word: DirectionWord): string =>
    word.key === "fwRule.classicValue" ? classic(word.value) : t(word.key);

  const kind = (word: KindWord): string =>
    word.key === "firewall.kind.classic"
      ? fill("firewall.kind.classic", { kind: word.kind })
      : t(word.key);

  const port = (word: PortWord): string => {
    switch (word.key) {
      case "firewall.port_one": {
        const one = fill("firewall.port_one", { port: String(word.port) });
        return word.service === null
          ? one
          : fill("firewall.portNamed", { port: one, name: t(word.service) });
      }
      case "firewall.portRange":
        return fill("firewall.portRange", {
          from: String(word.from),
          to: String(word.to),
        });
      case "fwRule.classicValue":
        return classic(word.value);
    }
  };

  const who = (word: WhoWord): string => {
    switch (word.key) {
      case "firewall.who.any":
        return t("firewall.who.any");
      case "firewall.who.one":
        return fill("firewall.who.one", { address: word.address });
      case "firewall.who.network":
        return word.count.kind === "huge"
          ? fill("firewall.who.networkHuge", { network: word.network })
          : fill("firewall.who.network", {
              network: word.network,
              count: word.count.count.toLocaleString("en"),
            });
      case "firewall.who.range":
        return fill("firewall.who.range", {
          first: word.first,
          last: word.last,
        });
      case "firewall.who.except":
        return fill("firewall.who.except", { who: who(word.who) });
      case "fwRule.classicValue":
        return classic(word.value);
    }
  };

  const traffic = (row: RuleRow): string => {
    const slots = {
      direction: direction(row.traffic.direction),
      kind: kind(row.traffic.kind),
    };
    return row.traffic.port === null
      ? fill("firewall.traffic", slots)
      : fill("firewall.trafficPort", {
          ...slots,
          port: port(row.traffic.port),
        });
  };

  const option = (word: NoteWord): string =>
    word.key === "firewall.note.classic"
      ? fill("firewall.note.classic", { options: word.options })
      : t(word.key);

  /** One rule on one line: "1. Allow: Coming in, TCP to port 22 (SSH); Any computer; its note". */
  const ruleLine = (row: RuleRow): string => {
    const peer = [who(row.who)];
    if (row.nasSide !== null) {
      peer.push(
        fill("firewall.who.nasSide", { address: who(row.nasSide.address) }),
      );
    }
    const parts = [`${action(row.then)}: ${traffic(row)}`, peer.join(" ")];
    if (row.otherPort !== null) {
      parts.push(fill("firewall.otherPort", { value: row.otherPort.value }));
    }
    if (row.options !== null) {
      parts.push(option(row.options));
    }
    if (row.comment.trim() !== "") {
      parts.push(row.comment.trim());
    }
    return `${String(row.position)}. ${parts.join("; ")}`;
  };

  /** "Copy the current settings" for a firewall list: every rule in order, or the empty list's words. */
  const rulesNote = (
    rules: readonly FirewallRule[],
    names: PortNames,
  ): string => {
    const rows = ruleRows(rules, names);
    return rows.length === 0
      ? t("firewall.none")
      : rows.map((row) => ruleLine(row)).join("\n");
  };

  return { ruleLine, rulesNote, who, traffic };
}
