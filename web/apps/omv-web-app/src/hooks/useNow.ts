// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";

/** The wall-clock time, refreshed every `intervalMs` while it is not null. */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (intervalMs === null) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
