// SPDX-License-Identifier: GPL-3.0-or-later
// A new shared folder's name and its folder on the file system (phase 5 shares design 0.5), checked
// in the browser before the server sees them, by the add flow and the repair dialog. Each check gives
// one message key at a time, in the design's order, so the field says the first thing to fix.
//
// The rules are the contract's (SharedFolderName.yaml, SharedFolderRelPath.yaml), with the two checks
// a pattern cannot make: OMV counts a name's length in BYTES of UTF-8 (observed on the test VM: 41
// Hebrew letters, 82 bytes, refused; 40 accepted), and a name must differ from every other folder's
// ignoring case, because Windows and Mac computers do not tell `Photos` from `photos` (OMV takes
// both). A path must not be another folder's on the same file system (OMV refuses that too). Pure.
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { typedMatches } from "@omv-webui/react-ui-components";
import { inertBidi } from "../format/isolate.ts";

/** OMV's limit on a shared folder's name, in bytes of UTF-8. */
export const NAME_MAX_BYTES = 80;
/** The longest folder name a file system takes, in bytes. */
export const PATH_PART_MAX_BYTES = 255;
/** The deepest path the contract accepts. */
export const PATH_MAX_PARTS = 8;
/** The description's limit (design 2.6, the contract's). */
export const DESCRIPTION_MAX = 255;

/** The names Samba keeps for its own sections and services, compared ignoring case. */
export const RESERVED_NAMES = [
  "global",
  "homes",
  "printers",
  "print$",
  "ipc$",
] as const;

const encoder = new TextEncoder();

/** How OMV measures a name: its bytes in UTF-8. */
export const byteLength = (text: string): number => encoder.encode(text).length;

// The share-name rule's forbidden characters, as the contract has them; the control characters
// (U+0000 to U+001F) are checked by code point.
const FORBIDDEN = /["\\/[\]:|<>+=;,*?]/u;

/** Whether text holds a control character (U+0000 to U+001F), which names and paths refuse. */
export const hasControl = (text: string): boolean =>
  [...text].some((c) => (c.codePointAt(0) ?? 0) < 0x20);

export type NameProblem =
  | { key: "addShare.name.length" }
  | { key: "addShare.name.chars" }
  | { key: "addShare.name.dots" }
  | { key: "addShare.name.reserved"; name: string }
  | { key: "addShare.name.taken"; other: string };

/** Two names a Windows or Mac computer would take for the same share. */
export const sameShareName = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

/**
 * The first rule a new shared folder's name breaks, or null when it may be used. The name is taken as
 * typed: a space at either end is a fault, not something to trim away. `folders` are the existing
 * shared folders (the whole getList read), for the name taken ignoring case.
 */
export function nameProblem(
  name: string,
  folders: readonly Pick<SharedFolder, "name">[] = [],
): NameProblem | null {
  const bytes = byteLength(name);
  if (bytes < 1 || bytes > NAME_MAX_BYTES) {
    return { key: "addShare.name.length" };
  }
  if (
    FORBIDDEN.test(name) ||
    hasControl(name) ||
    name.startsWith(" ") ||
    name.endsWith(" ")
  ) {
    return { key: "addShare.name.chars" };
  }
  if (name.startsWith(".") || name.includes("..")) {
    return { key: "addShare.name.dots" };
  }
  if ((RESERVED_NAMES as readonly string[]).includes(name.toLowerCase())) {
    return { key: "addShare.name.reserved", name };
  }
  const other = folders.find((f) => sameShareName(f.name, name));
  if (other !== undefined) {
    return { key: "addShare.name.taken", other: other.name };
  }
  return null;
}

/** The whole file system, as OMV stores it. */
export const WHOLE_FS = "/";

/** A path as typed, without the leading and trailing slashes the design says are removed. "/" stays. */
export function normalisePath(text: string): string {
  if (text.trim() === WHOLE_FS) {
    return WHOLE_FS;
  }
  return text.replace(/^\/+/u, "").replace(/\/+$/u, "");
}

/** A stored `reldirpath` for display and comparison: without its trailing slash; "/" stays "/". */
export function displayPath(reldirpath: string): string {
  if (reldirpath === WHOLE_FS || reldirpath === "") {
    return reldirpath;
  }
  return reldirpath.replace(/\/+$/u, "");
}

export const isWholeFs = (reldirpath: string): boolean =>
  reldirpath === WHOLE_FS;

/** The default folder of a new shared folder: one with its own name at the top of the file system. */
export const defaultPath = (name: string): string => name;

export type PathProblem =
  | { key: "addShare.path.invalid" }
  | { key: "addShare.path.tooDeep" }
  | { key: "addShare.path.taken"; other: string };

/**
 * The first rule a folder on the file system breaks, or null. `path` is what would be sent: "/" for
 * the whole file system (its own tick, never typed), else the normalised path (normalisePath). The
 * taken check compares with every other folder on the same mount entry; `except` is the folder being
 * repaired, which may keep its own path.
 */
export function pathProblem(
  path: string,
  mntentref: string,
  folders: readonly Pick<
    SharedFolder,
    "uuid" | "name" | "mntentref" | "reldirpath"
  >[] = [],
  except?: string,
): PathProblem | null {
  if (path !== WHOLE_FS) {
    const parts = path.split("/");
    const bad = parts.some(
      (part) =>
        part === "" ||
        part.startsWith(".") ||
        byteLength(part) > PATH_PART_MAX_BYTES ||
        part.includes("\\") ||
        hasControl(part),
    );
    if (bad || path.includes("..")) {
      return { key: "addShare.path.invalid" };
    }
    if (parts.length > PATH_MAX_PARTS) {
      return { key: "addShare.path.tooDeep" };
    }
  }
  const other = folders.find(
    (f) =>
      f.uuid !== except &&
      f.mntentref === mntentref &&
      displayPath(f.reldirpath) === path,
  );
  return other === undefined
    ? null
    : { key: "addShare.path.taken", other: other.name };
}

/**
 * Whether `inner` is the same folder as `outer` or one inside it, on one file system: what makes OMV
 * refuse to delete `outer` with its files (design 0.9, 8.1). Both are stored `reldirpath`s.
 */
export function isSameOrInside(outer: string, inner: string): boolean {
  const a = displayPath(outer);
  const b = displayPath(inner);
  if (a === WHOLE_FS) {
    return true;
  }
  return b === a || b.startsWith(`${a}/`);
}

/** The description's one rule (design 2.6). */
export const descriptionProblem = (
  comment: string,
): { key: "sharedFolder.description.tooLong" } | null =>
  comment.length > DESCRIPTION_MAX
    ? { key: "sharedFolder.description.tooLong" }
    : null;

/**
 * Whether what was typed confirms deleting the folder `name` (design 8.4: exact and case-sensitive,
 * spaces around ignored). The prompt shows the name with its bidirectional controls as "�"
 * (format/isolate.ts), so both sides are compared in that shown form: typing (or pasting) what the
 * prompt shows matches, and so does the stored name itself. Every other character must be exact.
 */
export const typedNameMatches = (typed: string, name: string): boolean =>
  typedMatches(inertBidi(typed), inertBidi(name));
