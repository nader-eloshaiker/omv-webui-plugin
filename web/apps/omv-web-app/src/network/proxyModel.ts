// SPDX-License-Identifier: GPL-3.0-or-later
// The proxy (phase 5 network design 12, 0.6, 0.8's "Save the proxy", 0.9): the form's draft, the
// stored-password rule (12.3, P9), the checks and the body of Network.setProxy. Saving is Not affected
// for this page (0.5). Pure.
//
// Read from OMV's source (8.6.x): setProxy needs all fifteen fields and stores each password as sent,
// so an empty one removes a stored password. The page never has a stored password (the transport
// replaces it by whether it is set), so for each proxy with one the reader either types it again or
// removes it; the save is unavailable until every stored password has one of the two.
import type { ProxyKind, ProxySettings, SetProxyRequest } from "./dto.ts";
import { isComputerName, parseAddress } from "./ip.ts";

export const PROXY_KINDS = [
  "http",
  "https",
  "ftp",
] as const satisfies readonly ProxyKind[];

/** OMV's stored defaults for new values (D18). */
export const DEFAULT_PROXY_PORTS = {
  http: 8080,
  https: 4443,
  ftp: 2121,
} as const satisfies Record<ProxyKind, number>;

/** A proxy's password in the form. */
export type PasswordDraft =
  /** No stored password: an optional new one ("" for none). */
  | { stored: false; typed: string }
  /** A stored password: a required choice, none made yet. */
  | { stored: true; choice: null }
  /** "Keep it: type it again". */
  | { stored: true; choice: "keep"; typed: string }
  /** "Remove the stored password". */
  | { stored: true; choice: "remove" };

export interface ProxyCardDraft {
  enable: boolean;
  host: string;
  /** As typed; checked for 1 to 65535. */
  port: string;
  username: string;
  password: PasswordDraft;
}

export type ProxyDraft = Record<ProxyKind, ProxyCardDraft>;

/** A stored port, or OMV's default for that proxy when none is stored (D18). */
const portOrDefault = (kind: ProxyKind, port: number): number =>
  Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : DEFAULT_PROXY_PORTS[kind];

/** The form's first values from Network.getProxy; no password is ever held. */
export function proxyDraft(read: ProxySettings): ProxyDraft {
  const card = (kind: ProxyKind): ProxyCardDraft => ({
    enable: read[`${kind}enable`],
    host: read[`${kind}host`],
    port: String(portOrDefault(kind, read[`${kind}port`])),
    username: read[`${kind}username`],
    password: read[`${kind}password`]
      ? { stored: true, choice: null }
      : { stored: false, typed: "" },
  });
  return { http: card("http"), https: card("https"), ftp: card("ftp") };
}

export type ProxyProblem =
  | { kind: ProxyKind; field: "host"; code: "proxy.err.host" }
  | { kind: ProxyKind; field: "port"; code: "proxy.err.port" }
  /** "Type the stored password again, or remove it, for: {{list}}." */
  | { field: "passwords"; code: "proxy.needPasswords"; list: ProxyKind[] };

const PORT_TEXT = /^[1-9][0-9]{0,4}$/u;

/** A computer's name or address. */
const isHost = (text: string): boolean =>
  parseAddress(text) !== null || isComputerName(text);

/** Whether a stored password still needs its choice (or the typed one is empty). */
const passwordUnmet = (password: PasswordDraft): boolean =>
  password.stored &&
  (password.choice === null ||
    (password.choice === "keep" && password.typed === ""));

/** Every problem of the form (0.8): host, port, and each stored password neither typed again nor removed. */
export function checkProxy(draft: ProxyDraft): ProxyProblem[] {
  const problems: ProxyProblem[] = [];
  for (const kind of PROXY_KINDS) {
    const card = draft[kind];
    const host = card.host.trim();
    if ((card.enable && host === "") || (host !== "" && !isHost(host))) {
      problems.push({ kind, field: "host", code: "proxy.err.host" });
    }
    if (!PORT_TEXT.test(card.port.trim()) || Number(card.port) > 65535) {
      problems.push({ kind, field: "port", code: "proxy.err.port" });
    }
  }
  const unmet = PROXY_KINDS.filter((kind) =>
    passwordUnmet(draft[kind].password),
  );
  if (unmet.length > 0) {
    problems.push({
      field: "passwords",
      code: "proxy.needPasswords",
      list: unmet,
    });
  }
  return problems;
}

/** The password a card sends: typed, or empty (removed, or none). */
const passwordSent = (password: PasswordDraft): string => {
  if (!password.stored) {
    return password.typed;
  }
  if (password.choice === "keep") {
    return password.typed;
  }
  return "";
};

/**
 * Network.setProxy (0.9): all fifteen fields from the draft, each password typed or empty. Throws
 * for a draft that did not pass checkProxy (a bug). The caller clears the typed passwords from form
 * state after the request (0.6).
 */
export function setProxyRequest(draft: ProxyDraft): SetProxyRequest {
  if (checkProxy(draft).length > 0) {
    throw new Error("The proxy was written without passing its checks.");
  }
  const { http, https, ftp } = draft;
  return {
    httpenable: http.enable,
    httphost: http.host.trim(),
    httpport: Number(http.port.trim()),
    httpusername: http.username,
    httppassword: passwordSent(http.password),
    httpsenable: https.enable,
    httpshost: https.host.trim(),
    httpsport: Number(https.port.trim()),
    httpsusername: https.username,
    httpspassword: passwordSent(https.password),
    ftpenable: ftp.enable,
    ftphost: ftp.host.trim(),
    ftpport: Number(ftp.port.trim()),
    ftpusername: ftp.username,
    ftppassword: passwordSent(ftp.password),
  };
}
