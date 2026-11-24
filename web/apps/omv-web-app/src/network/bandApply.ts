// SPDX-License-Identifier: GPL-3.0-or-later
// What the band does with its apply check (phase 5 network design 1.8): the typed confirmation of an
// escalated apply, what the reconnect watch expects afterwards (1.5), and the recovery card's input
// (1.6) when the NAS does not come back. Pure: the check itself is impact.ts's bandCheck.
import {
  confirmationMatches,
  type Confirmation,
  type Expectation,
} from "./changeFlow.ts";
import type { BandCheck, BandLine, Finding, Impact } from "./impact.ts";
import type { RecoveryChange } from "./recovery.ts";

/** The band's typed confirmation (1.8, 1.4 item 6), or "apply" when the page cannot tell which interface. */
export type BandConfirmation =
  Confirmation | { code: "netApply.typeApply"; value: "apply" };

export function bandConfirmation(check: BandCheck): BandConfirmation {
  const lines = check.lines;
  for (const line of lines) {
    if (line.code === "netApply.lineMoves") {
      return { code: "netChange.typeAddress", value: line.new };
    }
  }
  for (const line of lines) {
    if (line.code === "network.impact.moves") {
      return { code: "netChange.typeName", value: line.new };
    }
  }
  for (const line of lines) {
    if (line.code === "netApply.lineMayCut") {
      return { code: "netChange.typeIface", value: line.iface };
    }
  }
  const onlyFirewall =
    lines.length > 0 &&
    lines.every(
      (l) => l.code === "netApply.lineFirewall" || l.class === "brief",
    );
  return onlyFirewall
    ? { code: "netChange.typeFirewall", value: "firewall" }
    : { code: "netApply.typeApply", value: "apply" };
}

export const bandConfirmationMatches = (
  confirmation: BandConfirmation,
  typed: string,
): boolean =>
  confirmation.code === "netApply.typeApply"
    ? typed.trim().toLowerCase() === "apply"
    : confirmationMatches(confirmation, typed);

/** The band's lines as findings, for the watch's expectation and the recovery card's steps. */
export function bandImpact(check: BandCheck): Impact {
  const findings: Finding[] = check.lines.map((line: BandLine): Finding => {
    switch (line.code) {
      case "netApply.lineMoves":
        return {
          class: "moves",
          effect: "netChange.effect.newAddress",
          family: line.new.includes(":") ? 6 : 4,
          old: line.old,
          new: line.new,
        };
      case "network.impact.moves":
        return {
          class: "moves",
          effect: "netChange.effect.newName",
          old: line.old,
          new: line.new,
        };
      case "netApply.lineFirewall":
        return {
          class: "mayCut",
          effect: "netChange.effect.firewall",
          who: line.who,
        };
      case "netApply.lineMayCut":
      case "network.impact.mayCut":
        // The server's state cannot say whether the router will give a new address: the longer wait.
        return { class: "mayCut", effect: "netChange.effect.automatic" };
      case "netApply.lineBrief":
        return { class: "brief" };
      case "netApply.refusedFirewall":
        return {
          class: "refused",
          refusal: { code: "netApply.refusedFirewall", otherWay: false },
        };
      case "netApply.refusedIface":
        return {
          class: "refused",
          refusal: {
            code: "netApply.refusedIface",
            iface: line.iface,
            otherWay: false,
          },
        };
    }
  });
  return { class: check.class, findings };
}

/** The modules whose apply the band waits for, as 1.5 does, instead of calling the first failed read a failure (13.1). */
export const WAIT_MODULES = ["systemd-networkd", "iptables"] as const;

export const bandWaits = (pending: readonly string[]): boolean =>
  WAIT_MODULES.some((m) => pending.includes(m));

/** What the band's watch expects: a move when the check found one; else up to 60 or 120 seconds. */
export function bandExpectation(check: BandCheck | null): Expectation {
  const lines = check?.lines ?? [];
  for (const line of lines) {
    if (line.code === "netApply.lineMoves") {
      return { kind: "moved", timeout: 30, old: line.old, new: line.new };
    }
  }
  for (const line of lines) {
    if (line.code === "network.impact.moves") {
      return { kind: "movedName", timeout: 60, old: line.old, new: line.new };
    }
  }
  return lines.some(
    (l) =>
      l.code === "netApply.lineMayCut" || l.code === "network.impact.mayCut",
  )
    ? { kind: "automatic", timeout: 120 }
    : { kind: "same", timeout: 60 };
}

/** What the band applied, for the recovery card's last steps: the interfaces first, else the firewall, else the name. */
export function bandRecoveryChange(pending: readonly string[]): RecoveryChange {
  if (pending.includes("systemd-networkd")) {
    return "iface";
  }
  return pending.includes("iptables") ? "firewall" : "name";
}
