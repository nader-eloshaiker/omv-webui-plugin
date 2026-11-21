// SPDX-License-Identifier: GPL-3.0-or-later
// The Usage chart's samples (phase 5 design 1.6.1, D9): one per successful reply of the shell's
// System.getInformation poll, stamped with this computer's time of receipt, for the session and on any
// page, so coming back to the dashboard shows the line so far. In memory only: a reload or sign-out
// starts again. There is no history on the server (A7).
import type { SystemInformation } from "@omv-webui/react-api-omv/generated";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { addSample, usageSample, type UsageSample } from "./dashboard.ts";

export const usageSamples = createMemoryStore<{
  samples: readonly UsageSample[];
}>({
  samples: [],
});

/** Record one reply, received at `receivedAtMs`. */
export function recordUsage(
  info: SystemInformation,
  receivedAtMs: number,
): void {
  usageSamples.set((state) => ({
    samples: addSample(state.samples, usageSample(info, receivedAtMs)),
  }));
}
