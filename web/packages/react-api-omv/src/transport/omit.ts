// SPDX-License-Identifier: GPL-3.0-or-later
// The fields of a reply that the contract's x-omv-omit names, removed (docs/03, "Fields the
// transport removes"; UI-6). A path is a top-level field ("password"), or a field inside each row
// of a list ("data[].wpapsk"), at any depth ("data[].users[].password", "users.user[].password");
// the grammar and the walk are in replyPath.ts. Pure, so the transport and its tests share it.
import { mapAtPath, parseReplyPath } from "./replyPath.ts";

const removeField = (object: Record<string, unknown>, field: string) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => key !== field));

/** The reply without the fields `paths` names. The input is not changed. */
export function withoutOmitted(
  value: unknown,
  paths: readonly string[] | undefined,
): unknown {
  let out = value;
  for (const path of paths ?? []) {
    out = mapAtPath(out, parseReplyPath(path, "x-omv-omit"), removeField);
  }
  return out;
}
