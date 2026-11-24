// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's live sampler: development only (UI-11). OMV keeps no history as numbers (journal,
// A7), so a chart can only show what the open page has sampled. This stands in for a poll of CPU,
// memory, load and one interface's byte counters every SAMPLE_MS, kept for the session (up to
// SESSION_KEEP samples, so it survives moving between pages, which the foundation allows when it
// says so). The lab prefills five minutes so a screenshot shows a tab that has been open a while;
// the real page starts empty.
import { useSyncExternalStore } from "react";

export const SAMPLE_MS = 2000;
/** Ten minutes of samples: what a session keeps while the interface is open. */
export const SESSION_KEEP = 300;
/** The dashboard's window, in seconds: the last minute. */
export const DASH_WINDOW_S = 60;
const PREFILL = 150;

export interface Sample {
  t: number;
  cpu: number;
  memGiB: number;
  rxMiB: number;
  txMiB: number;
  load: number;
  cpuTemp: number;
}

let seed = 7;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function next(prev: Sample | undefined, t: number): Sample {
  const p = prev ?? {
    t,
    cpu: 9,
    memGiB: 3.1,
    rxMiB: 4,
    txMiB: 0.6,
    load: 0.42,
    cpuTemp: 49,
  };
  const burst = rand() > 0.86;
  const cpu = Math.min(
    96,
    Math.max(2, p.cpu * 0.6 + (burst ? 38 : 6) * rand() + 3),
  );
  const rx = Math.max(
    0.1,
    p.rxMiB * 0.55 + (burst ? 62 : 7) * rand() * (rand() > 0.3 ? 1 : 0.2),
  );
  return {
    t,
    cpu,
    memGiB: Math.min(6.9, Math.max(2.6, p.memGiB + (rand() - 0.5) * 0.12)),
    rxMiB: rx,
    txMiB: Math.max(0.05, p.txMiB * 0.5 + rand() * 1.6),
    load: Math.max(0.05, p.load * 0.8 + cpu / 100 + (rand() - 0.5) * 0.1),
    cpuTemp: Math.round(46 + cpu / 6 + rand() * 2),
  };
}

let samples: Sample[] = [];
{
  const now = Date.now();
  let prev: Sample | undefined;
  for (let i = PREFILL; i > 0; i -= 1) {
    prev = next(prev, now - i * SAMPLE_MS);
    samples.push(prev);
  }
}

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  samples = [...samples, next(samples.at(-1), Date.now())].slice(-SESSION_KEEP);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(tick, SAMPLE_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useSamples(): Sample[] {
  return useSyncExternalStore(subscribe, () => samples);
}

/** Pause or resume sampling (the lab freezes it for screenshots with ?still=1). */
export function freeze(): void {
  if (timer !== undefined) {
    clearInterval(timer);
  }
  timer = undefined;
  listeners.clear();
}
