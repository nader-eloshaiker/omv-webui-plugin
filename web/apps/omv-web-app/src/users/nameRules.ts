// SPDX-License-Identifier: GPL-3.0-or-later
// A new person's or group's name and a description (phase 5 users design 0.6, D13), checked in the
// browser before the server sees them. Each check gives one message key at a time, in the design's
// order. The interface's rule for NEW names is stricter than OMV's (capital letters, a leading digit,
// full stop or underscore, and a trailing `$` are refused); names that already exist are shown and
// used as they are, so the contract keeps OMV's pattern (Username.yaml) for every name it sends, and
// a test checks that the new-name rule never accepts what that pattern refuses. Pure.

/** OMV's own `username` format (the contract's Username.yaml). */
export const OMV_NAME = /^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*\$?$/;
/** The longest new name: the system's own limit for an account name (design 0.6). */
export const NAME_MAX = 32;
/** The interface's rule for a new name: small letters, digits, `.`, `_` and `-`, starting with a letter. */
export const NEW_NAME = /^[a-z][a-z0-9._-]*$/;
/** A description's limit (the classic form's, D13). */
export const DESCRIPTION_MAX = 65;

/** Names a person may not take, even when no such account exists (0.6). */
export const RESERVED_PERSON_NAMES: readonly string[] = [
  "admin",
  "administrator",
  "root",
  "guest",
  "nobody",
  "users",
  "everyone",
];
/** Names a group may not take (0.6). */
export const RESERVED_GROUP_NAMES: readonly string[] = [
  "users",
  "root",
  "admin",
  "sudo",
  "wheel",
  "everyone",
  "guests",
];

/** Whether a value can name an existing account or group at all: OMV's pattern, checked before any read. */
export const isAccountAddress = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  OMV_NAME.test(value);

/**
 * Whether a person can be opened on their own page here (design 14.2, the VM's change 11): the name
 * must pass OMV's pattern (UI-4), and `add` is the address of "Add a person", whose static route wins
 * over the person's. Every place that would link to a person's page asks this first.
 */
export const hasOwnPage = (name: string): boolean =>
  isAccountAddress(name) && name !== "add";

/**
 * Names this interface keeps for its own addresses (the owner's decision, 2026-11-22): `add` is the
 * address of "Add a person" and "Add a group", so a new person or group may not take it.
 */
export const RESERVED_HERE: readonly string[] = ["add"];

export type NewNameProblem =
  | { key: "length" }
  | { key: "chars" }
  | { key: "reserved" }
  | { key: "reservedHere" };

/** The browser's checks of a new name: length, characters, then (on Continue) the reserved names. */
export function newNameProblem(
  name: string,
  kind: "person" | "group",
  withReserved = true,
): NewNameProblem | null {
  if (name.length < 1 || name.length > NAME_MAX) {
    return { key: "length" };
  }
  if (!NEW_NAME.test(name)) {
    return { key: "chars" };
  }
  const reserved =
    kind === "person" ? RESERVED_PERSON_NAMES : RESERVED_GROUP_NAMES;
  if (withReserved && reserved.includes(name)) {
    return { key: "reserved" };
  }
  if (withReserved && RESERVED_HERE.includes(name)) {
    return { key: "reservedHere" };
  }
  return null;
}

/** What the reads at the flow's first step said about a name: free, or taken and how. */
export type NameUse =
  | { kind: "free" }
  | { kind: "person" }
  | { kind: "systemAccount" }
  | { kind: "group" };

export type DescriptionProblem = { key: "tooLong" } | { key: "chars" };

/** A description: at most 65 characters, no colon and no line break (2.5, D13). */
export function descriptionProblem(text: string): DescriptionProblem | null {
  if (text.length > DESCRIPTION_MAX) {
    return { key: "tooLong" };
  }
  if (/[:\r\n]/u.test(text)) {
    return { key: "chars" };
  }
  return null;
}
