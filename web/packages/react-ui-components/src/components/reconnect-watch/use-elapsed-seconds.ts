// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

/**
 * Seconds since `running` became true, ticking once a second, for `ReconnectWatch`'s waiting line
 * (phase 5 network design 1.5: elapsed time, never a countdown). Back to 0 whenever `running` turns
 * false, and from 0 again when it turns true.
 */
function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = React.useState(0);
  // Back to 0 when `running` changes, during render (React's adjusting-state pattern), not in an
  // effect.
  const [wasRunning, setWasRunning] = React.useState(running);
  if (running !== wasRunning) {
    setWasRunning(running);
    setElapsed(0);
  }
  React.useEffect(() => {
    if (!running) {
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return running ? elapsed : 0;
}

export { useElapsedSeconds };
