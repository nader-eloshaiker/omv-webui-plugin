// SPDX-License-Identifier: GPL-3.0-or-later
// The time of the last call the server counted as activity on the session, fed by the transport's
// onActivity. In memory only.
import { onActivity } from "@omv-webui/react-api-omv/transport";

export interface ActivityClock {
  getLastActivity(): number;
  subscribe(listener: () => void): () => void;
  /** Stop following the transport. */
  disconnect(): void;
}

export function createActivityClock(
  now: () => number = Date.now,
): ActivityClock {
  let last = now();
  const listeners = new Set<() => void>();
  const off = onActivity((sentAt) => {
    if (sentAt <= last) {
      return;
    }
    last = sentAt;
    for (const listener of [...listeners]) {
      listener();
    }
  });
  return {
    getLastActivity: () => last,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect: off,
  };
}
