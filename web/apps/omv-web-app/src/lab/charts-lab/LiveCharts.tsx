// SPDX-License-Identifier: GPL-3.0-or-later
// "Two charts, four series" (owner, round two): Processor and Memory (System.getInformation
// `cpuUtilization`, `memUsed`, `memTotal`) on one 0 to 100 % scale, and Network in and out (the
// change in Network.enumerateDevicesList `stats.rx_bytes` and `stats.tx_bytes` for enp2s0) mirrored
// about a baseline, each half on its own scale. Development only (UI-11).
//
// The drawing is the component library's `LivePercentChart` and `LiveMirrorChart`; this file only
// hands them the lab's readings as plain arrays and the lab's words, as a page will. Only the
// readings this page took are drawn, by the time each arrived, and each chart is an image with a
// text alternative giving the value now and the range seen.
import type { LiveSummary } from "@omv-webui/react-ui-components";
import {
  LiveMirrorChart,
  LivePercentChart,
} from "@omv-webui/react-ui-components";
import type { Series } from "./feed.ts";
import {
  clock,
  gibText,
  pct,
  rateText,
  scaleText,
  spanWords,
} from "./model.ts";

/** "Processor: 12 % now, between 1 % and 41 % since 10:31.", the lab's words for a summary. */
function describeWith(format: (v: number) => string) {
  return (s: LiveSummary): string => {
    if (s.range === null) {
      return `${s.name}: no reading yet.`;
    }
    const now =
      s.range.now === null
        ? "no value in the last reading"
        : `${format(s.range.now)} now`;
    if (s.span.kind === "one") {
      return `${s.name}: ${now}, one reading so far.`;
    }
    const span =
      s.span.kind === "since"
        ? `since ${clock(s.span.from)}`
        : "in the last 2 minutes";
    return `${s.name}: ${now}, between ${format(s.range.min)} and ${format(s.range.max)} ${span}.`;
  };
}

/** Processor and memory on one 0 to 100 % scale: processor teal and solid, memory violet and dashed. */
export function PercentPair({ s }: { s: Series }) {
  return (
    <LivePercentChart
      title="Processor and memory"
      aside={
        s.memUsed !== null && s.memTotal !== null
          ? `Memory: ${gibText(s.memUsed)} of ${gibText(s.memTotal)}`
          : undefined
      }
      series={[
        { name: "Processor", points: s.cpu },
        { name: "Memory", points: s.memory },
      ]}
      now={s.last}
      dropped={s.dropped}
      format={pct}
      missing="No reading"
      describe={describeWith(pct)}
    />
  );
}

/** Traffic in above the baseline and out below it, each half on its own scale written at its edge. */
export function NetworkMirror({ s }: { s: Series }) {
  return (
    <LiveMirrorChart
      title="Network, in above the line and out below"
      aside="enp2s0"
      above={{ name: "In", label: "Network in", points: s.rx }}
      below={{ name: "Out", label: "Network out", points: s.tx }}
      now={s.last}
      dropped={s.dropped}
      format={rateText}
      formatScale={scaleText}
      missing="No reading"
      describe={describeWith(rateText)}
      describeScales={(a, b) =>
        `In is drawn on a scale to ${scaleText(a)} and out on a scale to ${scaleText(b)}.`
      }
      note="The two halves are scaled separately."
    />
  );
}

export function PairedStrip({ s }: { s: Series }) {
  return (
    <div className="ch-strip ch-strip-pair">
      <PercentPair s={s} />
      <NetworkMirror s={s} />
    </div>
  );
}

/** The one line a strip says about its readings: how far back, and how often. */
export function SpanLine({ s, paused }: { s: Series; paused: boolean }) {
  const span = spanWords(s.cpu, s.dropped);
  return (
    <p className="ch-span">
      {span}, a reading every 2 seconds{paused ? ", paused" : ""}
    </p>
  );
}
