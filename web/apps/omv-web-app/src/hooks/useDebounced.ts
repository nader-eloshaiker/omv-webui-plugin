// SPDX-License-Identifier: GPL-3.0-or-later
// A value that follows another once it has stopped changing for `ms` (phase 5 shares design 3.3: the
// change count is announced 500 ms after the last change, not on every arrow press).
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
