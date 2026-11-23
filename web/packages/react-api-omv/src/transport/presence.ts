// SPDX-License-Identifier: GPL-3.0-or-later
// The fields of a reply that the contract's x-omv-presence names, replaced by whether they are set
// (docs/03, "Fields the transport removes"; UI-6): a stored password the server sends becomes `true`
// when it was a non-empty string and `false` otherwise, so a page can say "Set" without ever holding
// the password. The paths are those of x-omv-omit (replyPath.ts). Pure, so the transport and its
// tests share it.
import { mapAtPath, parseReplyPath, withField } from "./replyPath.ts";

// In every object the path reaches, the field is set to a boolean, also when it was absent: the
// schema declares it, and absent means not set. Only the object's own field counts.
const presenceOf = (object: Record<string, unknown>, field: string) => {
  const own = Object.hasOwn(object, field);
  const value = own ? object[field] : undefined;
  const isSet = typeof value === "string" && value !== "";
  return own ? withField(object, field, isSet) : { ...object, [field]: isSet };
};

/**
 * The reply with each field `paths` names replaced by `true` (a non-empty string) or `false`
 * (anything else, or nothing). Intermediate objects and rows that are not there are not created.
 * The input is not changed.
 */
export function withPresence(
  value: unknown,
  paths: readonly string[] | undefined,
): unknown {
  let out = value;
  for (const path of paths ?? []) {
    out = mapAtPath(out, parseReplyPath(path, "x-omv-presence"), presenceOf);
  }
  return out;
}
