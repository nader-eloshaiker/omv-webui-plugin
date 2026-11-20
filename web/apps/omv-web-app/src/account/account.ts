// SPDX-License-Identifier: GPL-3.0-or-later
// The account page's rules (phase 3 design 5): who may edit the details, how the details are checked
// before they are sent, and how a stored SSH key is shown. Pure, so each rule is tested by itself.
import { UserMgmtSetUserByContextRequestSchema } from "@omv-webui/react-api-omv/forms";
import type { Role } from "@omv-webui/react-api-omv/generated";

/**
 * The details can be edited only by a normal user whose account is not locked: OMV refuses the change
 * for a system account such as admin, and the reply cannot tell a system account from another, so an
 * administrator sees them read-only (design 5.1).
 */
export const detailsEditable = (role: Role, readonly: boolean): boolean =>
  role === "user" && !readonly;

export interface DetailsValues {
  email: string;
  comment: string;
}

/**
 * Which details the contract would refuse, checked with the request schema generated from it (its
 * Standard Schema interface), so the page accepts exactly what the backend does.
 */
export function detailsProblems(values: DetailsValues): {
  email: boolean;
  comment: boolean;
} {
  const result =
    UserMgmtSetUserByContextRequestSchema["~standard"].validate(values);
  if (result instanceof Promise || !result.issues) {
    return { email: false, comment: false };
  }
  const fields = new Set(
    result.issues.map((issue) => {
      const first = issue.path?.[0];
      return typeof first === "object" ? String(first.key) : String(first);
    }),
  );
  return { email: fields.has("email"), comment: fields.has("comment") };
}

export interface SshKeyView {
  /** The key's `Comment:` header, when it has one. */
  comment: string | null;
  /** The key itself, without its frame or headers. */
  body: string;
}

/**
 * A stored public key, as OMV keeps it (RFC 4716: a BEGIN line, headers such as `Comment: "…"`, the
 * base64 body, an END line). A key in the one-line OpenSSH form is read too: type, body, comment.
 */
export function parseSshKey(text: string): SshKeyView {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => line.startsWith("---- BEGIN SSH2 PUBLIC KEY"))) {
    let comment: string | null = null;
    const body: string[] = [];
    let header: string | null = null;
    for (const line of lines) {
      if (line === "" || line.startsWith("---- ")) {
        continue;
      }
      if (header !== null) {
        // A header continues on the next line after a trailing backslash.
        header += line;
      } else if (/^[A-Za-z][A-Za-z0-9-]*:/.test(line)) {
        header = line;
      } else {
        body.push(line);
        continue;
      }
      if (header.endsWith("\\")) {
        header = header.slice(0, -1);
        continue;
      }
      const match = /^Comment:\s*(.*)$/i.exec(header);
      if (match?.[1] !== undefined) {
        comment = match[1].replace(/^"(.*)"$/, "$1");
      }
      header = null;
    }
    return { comment: comment === "" ? null : comment, body: body.join("") };
  }
  const [, body = text.trim(), ...rest] = text.trim().split(/\s+/);
  const comment = rest.join(" ");
  return { comment: comment === "" ? null : comment, body };
}

/** The body shortened in the middle to its first and last 12 characters. */
export function shortKey(body: string): string {
  return body.length <= 27 ? body : `${body.slice(0, 12)}…${body.slice(-12)}`;
}
