// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's answer (rethink 6.2 A, P.2) and the order of what needs the person (6.2 B), apart
// from how they are drawn. The rule that matters most is fail-closed: "Everything is working" is said
// only when every read it rests on has arrived and none failed, and nothing needs the person. A read
// that failed, or one that has not arrived, can never make the answer "fine". The words are the
// caller's; this file decides which sentence applies.
import type { NasHealth, NasRead, NasReads } from "../nas-map/nas-map-model";
import { NAS_READS, byHealth } from "../nas-map/nas-map-model";

/** One thing that needs the person. Only a non-OK state needs anyone. */
export interface NasAttention {
  id: string;
  health: Exclude<NasHealth, "ok">;
}

/** What needs the person, worst first; equal ones keep the order they were found in. */
export function orderAttention<T extends { health: NasHealth }>(
  list: readonly T[],
): T[] {
  return list
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.health !== "ok")
    .sort((x, y) => byHealth(x.a.health, y.a.health) || x.i - y.i)
    .map(({ a }) => a);
}

/** At most `max` rows, then how many more (6.2 B). */
export function capAttention<T>(
  list: readonly T[],
  max = 3,
): { shown: T[]; more: number } {
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

export interface NasAnswerInput {
  /** Where each read is. A read missing from here has not arrived. */
  reads: NasReads;
  /** The reads the answer rests on; all of `NAS_READS` by default. */
  rests?: readonly NasRead[];
  /** What needs the person, in any order. */
  needs: readonly { health: NasHealth }[];
  /** The NAS has nothing on it yet (`isNewNas`). */
  newNas: boolean;
  /** How many storage there are, and how many have space (are not past their warning). */
  storage: { total: number; withSpace: number };
  /** When the disks' health was read (Smart.getListBg's reply arriving), as the app shows it: "10:31". */
  checkedAt?: string;
}

/** Which answer applies. Only `ok` may be worded "Everything is working". */
export type NasAnswerState =
  | { kind: "needs"; count: number; health: Exclude<NasHealth, "ok"> }
  | { kind: "unread"; failed: NasRead[] }
  | { kind: "welcome" }
  | { kind: "reading"; waiting: NasRead[] }
  | { kind: "ok"; total: number; withSpace: number; checkedAt?: string };

/**
 * The answer, in this order: something needs the person; a read failed (say which); a new NAS is
 * welcomed (it claims nothing about health); a read has not arrived; only then all is well.
 */
export function nasAnswerState(input: NasAnswerInput): NasAnswerState {
  const needs = orderAttention(input.needs);
  const first = needs[0];
  if (first && first.health !== "ok") {
    return { kind: "needs", count: needs.length, health: first.health };
  }
  const rests = input.rests ?? NAS_READS;
  const failed = rests.filter((r) => input.reads[r] === "failed");
  if (failed.length > 0) {
    return { kind: "unread", failed };
  }
  if (input.newNas) {
    return { kind: "welcome" };
  }
  const waiting = rests.filter((r) => input.reads[r] !== "ok");
  if (waiting.length > 0) {
    return { kind: "reading", waiting };
  }
  return { kind: "ok", ...input.storage, checkedAt: input.checkedAt };
}

/** The status the answer's mark shows. */
export function nasAnswerTone(state: NasAnswerState): NasHealth {
  switch (state.kind) {
    case "needs":
      return state.health;
    case "unread":
    case "reading":
      return "unknown";
    case "welcome":
    case "ok":
      return "ok";
  }
}

/** The sentence and its reason, one per answer, from the app's catalogue. */
export interface NasAnswerWords {
  /** "Four things need you." with the worst one's reason. */
  needs: (count: number) => string;
  /** "Part of the NAS could not be read." and which part. */
  unread: (failed: readonly NasRead[]) => { title: string; reason: string };
  /** "Welcome to your NAS." */
  welcome: { title: string; reason: string };
  /** "Reading the NAS…" while a read has not arrived. */
  reading: (waiting: readonly NasRead[]) => { title: string; reason?: string };
  /** "Everything is working." The only words that say so. */
  ok: (facts: { total: number; withSpace: number; checkedAt?: string }) => {
    title: string;
    reason: string;
  };
}

/** The words of an answer. `reason` is the worst need's own reason for `needs`. */
export function nasAnswerWords(
  state: NasAnswerState,
  words: NasAnswerWords,
  needReason?: string,
): { title: string; reason?: string } {
  switch (state.kind) {
    case "needs":
      return { title: words.needs(state.count), reason: needReason };
    case "unread":
      return words.unread(state.failed);
    case "welcome":
      return words.welcome;
    case "reading":
      return words.reading(state.waiting);
    case "ok":
      return words.ok(state);
  }
}
