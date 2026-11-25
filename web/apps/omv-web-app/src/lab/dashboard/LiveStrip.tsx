// SPDX-License-Identifier: GPL-3.0-or-later
// Region D, "Right now" (rethink spec 6.2 D, 7.6): one strip of live readouts of different widths,
// processor, memory, network (wider, in and out) and activity, from the session's samples through
// the app's own useLiveSamples (src/live; fed by liveFeed.ts in the lab). The live line and its dot
// are the dashboard's only loop, and only while sampling. In compact density the same readouts fold
// into region A's band as one line. Lab-local candidates for *LiveStrip and LiveTile's row form
// (spec 8 row 1). Development only (UI-11).
import { LiveFigure, Sparkline } from "@omv-webui/react-ui-components";
import type { SystemSample } from "../../live/liveSamples.ts";
import { useLiveSamples } from "../../live/useLive.ts";
import { FEED_MS } from "./liveFeed.ts";
import { rate, rx, tx } from "./liveReadings.ts";
import type { MapIface } from "./model.ts";

const WINDOW_MS = 60_000;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const NBSP = "\u00a0";

const cpu = (s: SystemSample) => s.cpu;
const mem = (s: SystemSample) => s.memory;

function gib(bytes: number | null): string {
  if (bytes === null) {
    return "";
  }
  return bytes < GiB
    ? `${(bytes / MiB).toFixed(1)}${NBSP}MiB`
    : `${(bytes / GiB).toFixed(1)}${NBSP}GiB`;
}

function liveWords(ms: number | null): string {
  if (ms === null) {
    return "Starting live readings";
  }
  return `Live · every ${String(FEED_MS / 1000)}${NBSP}s · last ${String(Math.min(60, Math.round(ms / 1000)))}${NBSP}s`;
}

export function LiveStrip({
  loading,
  layout,
  iface,
  connections,
}: {
  loading: boolean;
  layout: "wide" | "mid" | "narrow";
  /** At 900 the Network lane joins this strip: its address under the readout (6.3). */
  iface: MapIface | undefined;
  connections: number | null;
}) {
  const live = useLiveSamples();
  const system = loading ? [] : live.system;
  const traffic = loading ? [] : live.traffic;
  const last = system.at(-1);
  const net = traffic.at(-1);
  return (
    <section
      className="dm-live"
      data-layout={layout}
      aria-labelledby="dm-live-title"
    >
      <h2 id="dm-live-title" className="sr-only">
        Right now
      </h2>
      <div className="dm-readout" data-kind="cpu">
        <span className="dm-readout-label">Processor</span>
        <LiveFigure
          size="readout"
          value={last?.cpu ?? null}
          format={(v) => v.toFixed(0)}
          unit="%"
          missing="No reading yet"
        />
        <Sparkline
          data={system}
          value={cpu}
          intervalMs={FEED_MS}
          windowMs={WINDOW_MS}
          domain={[0, 100]}
          describe={({ now, peak }) =>
            now === null
              ? "Processor: no reading yet"
              : `Processor: ${now.toFixed(0)}% now, peak ${(peak ?? now).toFixed(0)}% in the last minute`
          }
          className="dm-spark"
        />
      </div>
      <div className="dm-readout" data-kind="mem">
        <span className="dm-readout-label">Memory</span>
        <span className="dm-readout-row">
          <LiveFigure
            size="readout"
            value={last?.memory ?? null}
            format={(v) => v.toFixed(0)}
            unit="%"
            missing="No reading yet"
          />
          {last ? (
            <span className="dm-readout-aside">
              {gib(last.memUsed)} of {gib(last.memTotal)}
            </span>
          ) : null}
        </span>
        <Sparkline
          data={system}
          value={mem}
          intervalMs={FEED_MS}
          windowMs={WINDOW_MS}
          domain={[0, 100]}
          describe={({ now }) =>
            now === null
              ? "Memory: no reading yet"
              : `Memory: ${now.toFixed(0)}% in use`
          }
          className="dm-spark"
        />
      </div>
      <div className="dm-readout" data-kind="net">
        <span className="dm-readout-label">
          Network
          {layout !== "wide" && iface ? (
            <span className="dm-readout-aside">
              {iface.name} · <span className="dm-mono">{iface.address}</span>
            </span>
          ) : null}
        </span>
        <span className="dm-net">
          <span className="dm-net-way">
            <span className="dm-net-dir" aria-hidden="true">
              ↓
            </span>
            <span className="sr-only">In</span>
            <LiveFigure
              size="readout"
              value={net ? rx(net) : null}
              format={rate}
              unit="MiB/s"
              missing="No reading yet"
            />
            <Sparkline
              data={traffic}
              value={rx}
              intervalMs={FEED_MS}
              windowMs={WINDOW_MS}
              describe={({ now, peak }) =>
                now === null
                  ? "Network in: no reading yet"
                  : `Network in: ${rate(now)} MiB/s now, peak ${rate(peak ?? now)} MiB/s`
              }
              className="dm-spark"
            />
          </span>
          <span className="dm-net-way">
            <span className="dm-net-dir" aria-hidden="true">
              ↑
            </span>
            <span className="sr-only">Out</span>
            <LiveFigure
              size="readout"
              value={net ? tx(net) : null}
              format={rate}
              unit="MiB/s"
              missing="No reading yet"
            />
            <Sparkline
              data={traffic}
              value={tx}
              intervalMs={FEED_MS}
              windowMs={WINDOW_MS}
              describe={({ now }) =>
                now === null
                  ? "Network out: no reading yet"
                  : `Network out: ${rate(now)} MiB/s now`
              }
              className="dm-spark dm-spark-out"
            />
          </span>
        </span>
      </div>
      <div className="dm-readout" data-kind="activity">
        <span className="dm-readout-label">Activity</span>
        <span className="dm-activity">No tasks running</span>
        {connections && !loading ? (
          <span className="dm-readout-aside">
            {connections === 1
              ? "1 computer connected"
              : `${String(connections)} computers connected`}
          </span>
        ) : null}
      </div>
      <p className="dm-live-foot" data-live={system.length > 0 || undefined}>
        <span className="dm-live-dot" aria-hidden="true" />
        {liveWords(loading ? null : (live.systemSpan?.ms ?? null))}
      </p>
    </section>
  );
}

/** Compact density: the same readouts as one line in region A's band (6.3). */
export function LiveLine({ loading }: { loading: boolean }) {
  const live = useLiveSamples();
  const system = loading ? [] : live.system;
  const traffic = loading ? [] : live.traffic;
  const last = system.at(-1);
  const net = traffic.at(-1);
  const r = net ? rx(net) : null;
  const t = net ? tx(net) : null;
  return (
    <p className="dm-liveline" aria-label="Right now">
      <span className="dm-liveline-item">
        <span className="dm-liveline-key">CPU</span>
        <LiveFigure
          size="inline"
          value={last?.cpu ?? null}
          format={(v) => v.toFixed(0)}
          unit="%"
          missing="–"
        />
        <Sparkline
          data={system}
          value={cpu}
          intervalMs={FEED_MS}
          domain={[0, 100]}
          describe={({ now }) =>
            now === null
              ? "Processor: no reading"
              : `Processor ${now.toFixed(0)}%`
          }
          className="dm-spark-mini"
        />
      </span>
      <span className="dm-liveline-item">
        <span className="dm-liveline-key">MEM</span>
        <LiveFigure
          size="inline"
          value={last?.memory ?? null}
          format={(v) => v.toFixed(0)}
          unit="%"
          missing="–"
        />
        <Sparkline
          data={system}
          value={mem}
          intervalMs={FEED_MS}
          domain={[0, 100]}
          describe={({ now }) =>
            now === null ? "Memory: no reading" : `Memory ${now.toFixed(0)}%`
          }
          className="dm-spark-mini"
        />
      </span>
      <span className="dm-liveline-item">
        <span className="dm-liveline-key">NET</span>
        <span className="dm-num">
          ↓{r === null ? "–" : rate(r)} ↑{t === null ? "–" : rate(t)} MiB/s
        </span>
        <Sparkline
          data={traffic}
          value={rx}
          intervalMs={FEED_MS}
          describe={({ now }) =>
            now === null
              ? "Network in: no reading"
              : `Network in ${rate(now)} MiB/s`
          }
          className="dm-spark-mini"
        />
      </span>
      <span className="dm-liveline-item">
        <span className="dm-liveline-key">TASKS</span>
        <span className="dm-num">0</span>
      </span>
    </p>
  );
}
