// SPDX-License-Identifier: GPL-3.0-or-later
// The band's apply confirmation from what this session saved (phase 5 network design 1.8, as built).
// 1.8's server-state rules read a stored automatic method on the page's interface, while it has an
// address now, as May cut, because the page cannot tell whether the pending change turned a fixed
// address automatic. On a NAS that uses an automatic address that would ask for the typed
// confirmation before every network apply, even for a name-server change this session saved as Brief
// interruption. So when every pending network change was saved in this session (networkSession.ts
// records each save with its class), the band uses those classes; when anything pending was not
// saved here (another administrator, the classic interface, a reload), it falls back to 1.8. Pure.
import { withoutSecrets } from "./changeFlow.ts";
import type { IfaceSettings, Read } from "./dto.ts";
import { sameSettings } from "./ifaceModel.ts";
import type { BandLine, Finding } from "./impact.ts";
import type { NetworkSaves } from "./networkSession.ts";

const byUuid = (list: readonly IfaceSettings[]) =>
  [...list].sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));

/** Whether two reads of the stored interfaces are the same, whatever their order; secrets aside. */
export function sameInterfaces(
  a: readonly IfaceSettings[],
  b: readonly IfaceSettings[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const x = byUuid(a);
  const y = byUuid(b);
  return x.every((s, i) => {
    const t = y[i];
    return (
      t !== undefined && sameSettings(withoutSecrets(s), withoutSecrets(t))
    );
  });
}

function lineOf(devicename: string, finding: Finding): BandLine | null {
  switch (finding.class) {
    case "brief":
      return { code: "netApply.lineBrief", class: "brief" };
    case "moves":
      return finding.effect === "netChange.effect.newAddress"
        ? {
            code: "netApply.lineMoves",
            class: "moves",
            iface: devicename,
            old: finding.old,
            new: finding.new,
          }
        : {
            code: "network.impact.moves",
            class: "moves",
            old: finding.old,
            new: finding.new,
          };
    case "mayCut":
      return {
        code: "netApply.lineMayCut",
        class: "mayCut",
        iface: devicename,
      };
    case "refused":
      // Never saved: a refused change has no Save. Should one be stored, the band refuses too.
      return {
        code: "netApply.refusedIface",
        class: "refused",
        iface: devicename,
      };
  }
}

/**
 * The interface lines from this session's saves, or null when the band must use 1.8's server-state
 * rules: nothing recorded, something pending that this session did not save, the stored interfaces
 * not as this session left them (someone saved since), or the read failed.
 */
export function sessionInterfaceLines(
  saves: NetworkSaves | null,
  stored: Read<readonly IfaceSettings[]>,
): BandLine[] | null {
  if (
    saves === null ||
    !saves.owned ||
    stored.state !== "ok" ||
    !sameInterfaces(stored.data, saves.interfaces)
  ) {
    return null;
  }
  const lines: BandLine[] = [];
  for (const change of saves.changes) {
    for (const finding of change.impact.findings) {
      const line = lineOf(change.devicename, finding);
      if (
        line !== null &&
        !lines.some((l) => JSON.stringify(l) === JSON.stringify(line))
      ) {
        lines.push(line);
      }
    }
  }
  return lines;
}
