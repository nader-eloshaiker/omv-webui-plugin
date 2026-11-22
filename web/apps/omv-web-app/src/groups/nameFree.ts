// SPDX-License-Identifier: GPL-3.0-or-later
// Whether a name is free (phase 5 users design 0.11; the test VM, OMV 8.6.1): UserMgmt.getUser and
// getGroup refuse a missing name with HTTP 500, code 0 and exactly "The user '<name>' does not
// exist." / "The group '<name>' does not exist.". Only that refusal, for that name, says the name is
// free; any other answer (a reply, another error, a cut request) stops a flow, so nothing is ever
// written over an existing account or group. Pure.
import { isRpcError } from "@omv-webui/react-api-omv/transport";

const refusal = (kind: "user" | "group", name: string) =>
  `The ${kind} '${name}' does not exist.`;

/** The error is getUser's or getGroup's "does not exist" for exactly this name. */
export function isMissing(
  kind: "user" | "group",
  name: string,
  error: unknown,
): boolean {
  return (
    isRpcError(error) &&
    error.status === 500 &&
    error.code === 0 &&
    error.message === refusal(kind, name)
  );
}

/** What one name read said: taken (with the reply), free, or not known (any other failure). */
export type NameRead<T> =
  | { kind: "taken"; value: T }
  | { kind: "free" }
  | { kind: "unknown"; error: unknown };

export async function readName<T>(
  kind: "user" | "group",
  name: string,
  read: (name: string) => Promise<T>,
): Promise<NameRead<T>> {
  try {
    return { kind: "taken", value: await read(name) };
  } catch (error) {
    return isMissing(kind, name, error)
      ? { kind: "free" }
      : { kind: "unknown", error };
  }
}
