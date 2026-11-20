// SPDX-License-Identifier: GPL-3.0-or-later
// The SSH form's rules (phase 3 design 3.3): one blocking check (the port) and four warnings that
// never block. Pure, so each rule is tested by itself. The form edits the port as text, so an empty
// or half-typed value can be shown and refused in words; everything else is the contract's DTO.
import type { SshSettings } from "@omv-webui/react-api-omv/generated";

export type SshDraft = Omit<SshSettings, "port"> & { port: string };

export const toDraft = (settings: SshSettings): SshDraft => ({
  ...settings,
  port: String(settings.port),
});

/** The whole object SSH.set takes (UX audit B11). Call only after `portProblem` found nothing. */
export const fromDraft = (draft: SshDraft): SshSettings => ({
  ...draft,
  port: Number(draft.port.trim()),
});

/** Whether the form differs from what the server holds. */
export function isDirty(saved: SshSettings, draft: SshDraft): boolean {
  const current = toDraft(saved);
  return (Object.keys(current) as (keyof SshDraft)[]).some(
    (key) => current[key] !== draft[key],
  );
}

/** The port this page was loaded on: the location's own, or the scheme's default. */
export function pagePort(
  location: Pick<Location, "port" | "protocol">,
): string {
  if (location.port !== "") {
    return location.port;
  }
  return location.protocol === "https:" ? "443" : "80";
}

export type PortProblem = "required" | "range" | "inUse";

/**
 * Why a port cannot be saved: empty (OMV requires one), not a whole number from 1 to 65535 (OMV's
 * datamodel), or the port this page was loaded on, the one conflict the page knows for certain (the
 * SSH server would fail to start after Apply).
 */
export function portProblem(port: string, webPort: string): PortProblem | null {
  const text = port.trim();
  if (text === "") {
    return "required";
  }
  if (!/^[0-9]+$/.test(text)) {
    return "range";
  }
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return "range";
  }
  return String(n) === webPort ? "inUse" : null;
}

export interface SshWarnings {
  /** SSH was on when the page loaded and is now off: connections stop after Apply. */
  turningOff: boolean;
  /** SSH on, with both ways of signing in off: nobody can sign in. */
  noMethod: boolean;
  /** SSH on, root may sign in, with a password: anyone who guesses it controls the NAS. */
  rootPassword: boolean;
  /** SSH on, password sign-in switched from on to off, keys on: only people with a key get in. */
  keysOnly: boolean;
}

/** The warnings for the values in the form, compared with what was loaded. They never block Save. */
export function sshWarnings(saved: SshSettings, draft: SshDraft): SshWarnings {
  const on = draft.enable;
  return {
    turningOff: saved.enable && !draft.enable,
    noMethod:
      on && !draft.passwordauthentication && !draft.pubkeyauthentication,
    rootPassword: on && draft.permitrootlogin && draft.passwordauthentication,
    keysOnly:
      on &&
      saved.passwordauthentication &&
      !draft.passwordauthentication &&
      draft.pubkeyauthentication,
  };
}

/** How many lines of extra configuration hold something, for "Advanced (2 lines set)". */
export const linesSet = (text: string): number =>
  text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
