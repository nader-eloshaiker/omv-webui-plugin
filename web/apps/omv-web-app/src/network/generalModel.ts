// SPDX-License-Identifier: GPL-3.0-or-later
// The name of this NAS (phase 5 network design 2, 0.8's first row, 0.9): the checks of the name and
// the domain, what other computers find it as, what a new name changes for them (2.3), and the body of
// Network.setGeneralSettings. What a new name does to this page is in impact.ts. Pure.
//
// Read from OMV's source (8.6.x): the host name is 1 to 63 letters, digits and hyphens, not starting
// or ending with a hyphen; the stored model refuses the domains `local`, `example`, `invalid` and
// `test`. Observed on the VM: OMV stores the name as sent, capitals included, and the contract takes
// lower case only, so this page sends it in lower case (D13).
import type { GeneralSettings, SetGeneralSettingsRequest } from "./dto.ts";
import { isComputerName } from "./ip.ts";

const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/** The domains OMV's stored model refuses. `local` has its own sentence. */
export const RESERVED_DOMAINS = ["example", "invalid", "test"] as const;

/** The longest name Windows computers that use old-style names see (NetBIOS) [verify]. */
export const WINDOWS_NAME_MAX = 15;

export interface NameProblem {
  field: "hostname";
  code: "netGeneral.err.name";
}

export type DomainProblem =
  | { field: "domainname"; code: "netGeneral.err.domain" }
  | { field: "domainname"; code: "netGeneral.err.local" }
  | { field: "domainname"; code: "netGeneral.err.reserved"; value: string };

/** The name: 1 to 63 letters, digits and hyphens, not starting or ending with a hyphen. */
export function checkHostname(raw: string): NameProblem | null {
  return HOSTNAME.test(raw.trim())
    ? null
    : { field: "hostname", code: "netGeneral.err.name" };
}

/** The domain: empty, or parts of letters, digits and hyphens separated by dots; not one of the four. */
export function checkDomain(raw: string): DomainProblem | null {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  const lower = text.toLowerCase();
  if (lower === "local") {
    return { field: "domainname", code: "netGeneral.err.local" };
  }
  if ((RESERVED_DOMAINS as readonly string[]).includes(lower)) {
    return {
      field: "domainname",
      code: "netGeneral.err.reserved",
      value: text,
    };
  }
  return isComputerName(text)
    ? null
    : { field: "domainname", code: "netGeneral.err.domain" };
}

/** Every problem of the name card, in field order (0.8's "Save the name"). */
export const checkGeneral = (
  draft: GeneralSettings,
): (NameProblem | DomainProblem)[] =>
  [checkHostname(draft.hostname), checkDomain(draft.domainname)].filter(
    (p): p is NameProblem | DomainProblem => p !== null,
  );

/** Network.setGeneralSettings (0.9): the name in lower case, the domain as typed (empty allowed). */
export function generalRequest(
  draft: GeneralSettings,
): SetGeneralSettingsRequest {
  if (checkGeneral(draft).length > 0) {
    throw new Error(
      "The name of this NAS was written without passing its checks.",
    );
  }
  return {
    hostname: draft.hostname.trim().toLowerCase(),
    domainname: draft.domainname.trim(),
  };
}

/** Whether the draft differs from the stored values, as they would be saved. */
export const generalChanged = (
  stored: GeneralSettings,
  draft: GeneralSettings,
): { hostname: boolean; domainname: boolean } => ({
  hostname:
    stored.hostname.trim().toLowerCase() !==
    draft.hostname.trim().toLowerCase(),
  domainname:
    stored.domainname.trim().toLowerCase() !==
    draft.domainname.trim().toLowerCase(),
});

/** The Windows name: the first 15 characters of the name. */
export const windowsName = (hostname: string): string =>
  hostname.trim().toLowerCase().slice(0, WINDOWS_NAME_MAX);

/** How others find it now (2.2 item 4), built from the stored values: `netGeneral.foundAs` and `foundAsDomain`. */
export function foundAs(stored: GeneralSettings): {
  host: string;
  local: string;
  unc: string;
  fqdn: string | null;
} {
  const host = stored.hostname.trim().toLowerCase();
  const domain = stored.domainname.trim();
  return {
    host,
    local: `${host}.local`,
    unc: `\\\\${windowsName(host)}`,
    fqdn: domain === "" ? null : `${host}.${domain}`,
  };
}

/** One line of "If you change it" (2.3), as its copy key and values. */
export type NameEffect =
  | { code: "netGeneral.effect.smb"; unc: string; smb: string }
  | { code: "netGeneral.effect.nfs" }
  | { code: "netGeneral.effect.bookmarks" }
  | { code: "netGeneral.effect.certificate" }
  | { code: "netGeneral.effect.router" }
  | { code: "netGeneral.effect.domain"; fqdn: string }
  | { code: "netGeneral.effect.short"; short: string };

/**
 * What a new name or domain changes for other computers (2.3), shown under the fields and in the
 * flow's "What it does to other computers". `https` is WebGui.getSettings' `enablessl`.
 */
export function nameEffects(
  stored: GeneralSettings,
  draft: GeneralSettings,
  https: boolean,
): NameEffect[] {
  const changed = generalChanged(stored, draft);
  const old = stored.hostname.trim().toLowerCase();
  const next = draft.hostname.trim().toLowerCase();
  const effects: NameEffect[] = [];
  if (changed.hostname) {
    effects.push(
      {
        code: "netGeneral.effect.smb",
        unc: `\\\\${windowsName(old)}`,
        smb: `smb://${old}`,
      },
      { code: "netGeneral.effect.nfs" },
      { code: "netGeneral.effect.bookmarks" },
      ...(https ? [{ code: "netGeneral.effect.certificate" } as const] : []),
      { code: "netGeneral.effect.router" },
    );
  }
  const oldDomain = stored.domainname.trim();
  if (changed.domainname && oldDomain !== "") {
    effects.push({
      code: "netGeneral.effect.domain",
      fqdn: `${old}.${oldDomain}`,
    });
  }
  if (changed.hostname && next.length > WINDOWS_NAME_MAX) {
    effects.push({ code: "netGeneral.effect.short", short: windowsName(next) });
  }
  return effects;
}
