// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance prototype's small decisions, kept out of the components so they can be tested
// directly (rethink P.3, 6.8). Development only (UI-11).
import type { SeenKey } from "../../stores/useSeenStore.ts";
import type { LaneId, Nas } from "../dashboard/model.ts";

/** The palette field's words, and its G2 tip until the palette is first used. */
export const PALETTE_LABEL = "Go to or do…";
export const PALETTE_TIP = "Press / to go anywhere";

const ALL_LANES: readonly LaneId[] = [
  "disks",
  "storage",
  "folders",
  "ways",
  "network",
];

const NOTHING: readonly LaneId[] = [];

/**
 * The column captions on the map (6.8, P.3 G1): every column on a new NAS, the shared folders column
 * alone while there are none; none with tips off, and none in compact density (owner decision 11).
 */
export function captionsFor(
  nas: Nas,
  tips: boolean,
  compact: boolean,
): readonly LaneId[] {
  if (compact || !tips) {
    return NOTHING;
  }
  if (nas.newNas) {
    return ALL_LANES;
  }
  return nas.folders.length === 0 ? ["folders"] : NOTHING;
}

export type TipState = "showing" | "waiting" | "ended" | "not-yet" | "off";

/** Where a tip is, for the lab's line beside each specimen. */
export function tipState({
  id,
  show,
  seen,
  when,
  current,
}: {
  id: SeenKey;
  show: boolean;
  seen: boolean;
  when: boolean;
  current: string | null;
}): TipState {
  if (!show) {
    return "off";
  }
  if (seen) {
    return current === id ? "showing" : "ended";
  }
  if (!when) {
    return "not-yet";
  }
  return current === id ? "showing" : "waiting";
}
