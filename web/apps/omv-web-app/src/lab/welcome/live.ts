// SPDX-License-Identifier: GPL-3.0-or-later
// "Right now" in the lab: the readings this page takes, every 2 seconds while it is open, of the
// mock's own figures (src/mocks/liveFigures.ts): processor and memory from System.getInformation
// (`cpuUtilization`, `memUsed` of `memTotal`), received and sent from Network.enumerateDevicesList's
// counters for enp2s0, as the app turns counters into rates. Development only (UI-11).
//
// A live history shows only the readings the page took: it starts with one, and grows. `still=1`
// stands for a page open for 80 seconds: 40 readings ending at a fixed time, and no more, so every
// screenshot is the same.
import {
  LIVE_INTERVAL_MS,
  type LivePoint,
} from "@omv-webui/react-ui-components";
import { useEffect, useState } from "react";
import {
  interfaceRates,
  memoryShareAt,
  processorAt,
} from "../../mocks/liveFigures.ts";

/** System.getInformation `memTotal` on the mock, in bytes. */
export const MEM_TOTAL = 4104114176;
const MIB = 1024 ** 2;

/** The fixed end of the still readings: 10:31:00 on 19 November 2026, on this computer's clock. */
const STILL_END = new Date(2026, 10, 19, 10, 31, 0).getTime();
const STILL_COUNT = 40;

export interface LiveReadings {
  processor: LivePoint[];
  memory: LivePoint[];
  /** MiB/s. */
  received: LivePoint[];
  sent: LivePoint[];
  /** The newest memory reading in bytes, for "Memory: 949.6 MiB of 3.8 GiB". */
  memUsed: number | null;
  /** When the first reading was taken. */
  since: number | null;
}

function reading(t: number) {
  const rates = interfaceRates("enp2s0", t);
  const share = memoryShareAt(t);
  return {
    processor: { t, v: processorAt(t) },
    memory: { t, v: Math.round(share * 1000) / 10 },
    received: { t, v: rates.rx },
    sent: { t, v: rates.tx },
    memUsed: share * MEM_TOTAL,
  };
}

function build(times: readonly number[]): LiveReadings {
  const all = times.map(reading);
  return {
    processor: all.map((r) => r.processor),
    memory: all.map((r) => r.memory),
    received: all.map((r) => r.received),
    sent: all.map((r) => r.sent),
    memUsed: all.at(-1)?.memUsed ?? null,
    since: times[0] ?? null,
  };
}

const stillTimes = () =>
  Array.from(
    { length: STILL_COUNT },
    (_, i) => STILL_END - (STILL_COUNT - 1 - i) * LIVE_INTERVAL_MS,
  );

/** The page's readings: one now, then one every 2 seconds, two minutes kept; fixed with `still`. */
export function useLiveReadings(still: boolean): LiveReadings {
  const [times, setTimes] = useState<number[]>(() =>
    still ? stillTimes() : [Date.now()],
  );
  useEffect(() => {
    if (still) {
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      setTimes((list) => [...list, now].filter((t) => now - t <= 120_000));
    }, LIVE_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [still]);
  return build(times);
}

export { MIB };
