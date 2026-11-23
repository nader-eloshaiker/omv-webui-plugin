// SPDX-License-Identifier: GPL-3.0-or-later
// The recovery card (phase 5 network design 1.6): which variant and which steps it shows. It needs
// nothing from the NAS: every value comes from what was read before the apply or typed in this
// session. Only a value typed in this session may become a link (P7, UI-3); an address or a name
// read from the NAS is text with a copy button. Pure.
import {
  localUrl,
  pageUrl,
  type Certainty,
  type PageLocation,
} from "./connection.ts";
import type { Impact } from "./impact.ts";

/** The card's first line, `netRecover.{variant}`; null inside the summary's Disclosure, before applying. */
export type RecoveryVariant = "lost" | "unknownAddress" | "newFails";

/** What the flow changed. */
export type RecoveryChange = "iface" | "name" | "firewall";

/** One numbered step, as its copy key and values; `link` says whether its address may be a link. */
export type RecoveryStep =
  /** "Wait two minutes, then try again." with "Try again" (one read; no write). */
  | { code: "netRecover.wait" }
  /** "Open the NAS at its new address: {{url}}" then `netRecover.sameNetwork`. Typed in this session: a link. */
  | { code: "netRecover.newAddress"; url: string; link: true }
  /** "Find the NAS's address: … under the name {{name}}. … try {{url}}." The name came from the NAS: text. */
  | { code: "netRecover.find"; name: string; url: string; link: false }
  /** "Open the NAS by its new name: {{url}}, or at its address {{address}}." The name typed: a link; the address read: text. */
  | {
      code: "netRecover.newName";
      url: string;
      link: true;
      address: string | null;
    }
  /** "If a firewall rule blocks this computer, use a computer the rules still let in, then change the rules." */
  | { code: "netRecover.firewall" }
  /**
   * "If nothing else works, connect a screen and keyboard…" then the command, in `Identifier`, not a
   * copy button. The firewall's is OMV's own script, not the service: after a failed firewall apply
   * the service is in the failed state and stopping it removes no rule (observed on the test VM).
   */
  | {
      code: "netRecover.console";
      then: "netRecover.firstaid" | "netRecover.stopFirewall";
      command: "omv-firstaid" | "/etc/iptables/openmediavault-firewall.sh stop";
    }
  /** "The note you copied before applying has the settings that worked." */
  | { code: "netRecover.note" };

export interface RecoveryInput {
  variant: RecoveryVariant | null;
  change: RecoveryChange;
  /** The change's class and findings (impact.ts), from before the apply. */
  impact: Impact;
  /** How sure the page was of its connection before the apply. */
  certainty: Certainty;
  location: PageLocation;
  /** The NAS's name as read before the apply. */
  hostname: string;
  /** The new name typed on the name page, for a name change. */
  newName?: string;
  /** The address this page used, read before the apply (shown as text). */
  addressBefore?: string | null;
  /** The summary's "Copy the current settings" was used in this page. */
  copied: boolean;
}

/** The variant's first line and the steps, each shown only when it applies, in 1.6's order. */
export function recoveryCard(input: RecoveryInput): {
  first: `netRecover.${RecoveryVariant}` | null;
  steps: RecoveryStep[];
} {
  const steps: RecoveryStep[] = [{ code: "netRecover.wait" }];
  const { impact, location } = input;
  const newAddress = impact.findings.find(
    (f) => f.class === "moves" && f.effect === "netChange.effect.newAddress",
  );
  const newName = impact.findings.find(
    (f) => f.class === "moves" && f.effect === "netChange.effect.newName",
  );
  const addressUnknown =
    impact.findings.some(
      (f) =>
        f.class === "mayCut" &&
        (f.effect === "netChange.effect.automatic" ||
          f.effect === "netChange.effect.wifi"),
    ) ||
    input.variant === "unknownAddress" ||
    input.certainty === "notKnown";

  if (newAddress?.class === "moves") {
    steps.push({
      code: "netRecover.newAddress",
      url: pageUrl(location, newAddress.new),
      link: true,
    });
  }
  if (
    input.change === "iface" &&
    newAddress === undefined &&
    addressUnknown &&
    input.hostname.trim() !== ""
  ) {
    steps.push({
      code: "netRecover.find",
      name: input.hostname.trim().toLowerCase(),
      url: localUrl(input.hostname),
      link: false,
    });
  }
  if (input.change === "name" && newName?.class === "moves") {
    const typed = (input.newName ?? newName.new).trim().toLowerCase();
    const address = input.addressBefore ?? null;
    steps.push({
      code: "netRecover.newName",
      url: pageUrl(location, typed),
      link: true,
      address:
        address === null || address === "" ? null : pageUrl(location, address),
    });
  }
  if (input.change === "firewall") {
    steps.push({ code: "netRecover.firewall" });
  }
  // At the NAS itself, last of the ways back. A changed name leaves the NAS at its address, so the
  // console's network reset (which removes every other interface's settings) is not offered for it.
  if (input.change === "iface") {
    steps.push({
      code: "netRecover.console",
      then: "netRecover.firstaid",
      command: "omv-firstaid",
    });
  } else if (input.change === "firewall") {
    steps.push({
      code: "netRecover.console",
      then: "netRecover.stopFirewall",
      command: "/etc/iptables/openmediavault-firewall.sh stop",
    });
  }
  if (input.copied) {
    steps.push({ code: "netRecover.note" });
  }
  return {
    first: input.variant === null ? null : `netRecover.${input.variant}`,
    steps,
  };
}
