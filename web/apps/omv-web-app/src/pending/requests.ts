// SPDX-License-Identifier: GPL-3.0-or-later
// The command palette's "Apply N pending changes" (foundation 13): it asks the pending band to open its
// apply confirmation, so the palette never applies anything itself and every apply goes through the
// same confirmation, the network check and the task (style guide 5.8; phase 5 network design 1.8).
// An event, not state: nothing is kept, so nothing needs emptying when the session ends.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Ask the band to open its apply confirmation. */
export function requestApply(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** The band listens here. Returns an unsubscribe. */
export function onApplyRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
