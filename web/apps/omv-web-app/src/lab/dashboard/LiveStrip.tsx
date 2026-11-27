// SPDX-License-Identifier: GPL-3.0-or-later
// Region D, "Right now" (rethink spec 6.2 D): one line of live figures of different widths on the page
// ground, each with its label in sentence case beside it, and once, in secondary text, how often they
// update. No boxes, no sparklines and no "live" dot: nothing pulses. Processor and memory come from
// System.getInformation (`cpuUtilization`, `memUtilization`, `memUsed`, `memTotal`); the network
// rates are the change in the first interface's counters (Network.getInterfaceList `stats`, rx_bytes
// and tx_bytes) between two readings. They reach the page through the session's samples and the
// app's own useLiveSamples (src/live; fed by liveFeed.ts in the lab). Lab-local candidate for
// *LiveStrip (spec 8 row 1). Development only (UI-11).
import { LiveFigure } from "@omv-webui/react-ui-components";
import { useLiveSamples } from "../../live/useLive.ts";
import { FEED_MS } from "./liveFeed.ts";
import { rate, rx, tx } from "./liveReadings.ts";

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const NBSP = " ";

function gib(bytes: number | null): string {
  if (bytes === null) {
    return "";
  }
  return bytes < GiB
    ? `${(bytes / MiB).toFixed(1)}${NBSP}MiB`
    : `${(bytes / GiB).toFixed(1)}${NBSP}GiB`;
}

export function LiveStrip({
  loading,
  layout,
}: {
  loading: boolean;
  layout: "wide" | "mid" | "narrow";
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
      <header className="dm-region-head">
        <h2 id="dm-live-title" className="dm-region-title dm-region-title-sm">
          Right now
        </h2>
        <p className="dm-region-note">
          Updates every {String(FEED_MS / 1000)} seconds
        </p>
      </header>
      <dl className="dm-readouts">
        <div className="dm-readout">
          <dt>Processor</dt>
          <dd>
            <LiveFigure
              size="inline"
              value={last?.cpu ?? null}
              format={(v) => v.toFixed(0)}
              unit="%"
              missing="No reading yet"
            />
          </dd>
        </div>
        <div className="dm-readout">
          <dt>Memory</dt>
          <dd>
            <LiveFigure
              size="inline"
              value={last?.memory ?? null}
              format={(v) => v.toFixed(0)}
              unit="%"
              missing="No reading yet"
            />
            {last ? (
              <span className="dm-readout-aside">
                , {gib(last.memUsed)} of {gib(last.memTotal)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="dm-readout">
          <dt>Network in</dt>
          <dd>
            <LiveFigure
              size="inline"
              value={net ? rx(net) : null}
              format={rate}
              unit="MiB/s"
              missing="No reading yet"
            />
          </dd>
        </div>
        <div className="dm-readout">
          <dt>Network out</dt>
          <dd>
            <LiveFigure
              size="inline"
              value={net ? tx(net) : null}
              format={rate}
              unit="MiB/s"
              missing="No reading yet"
            />
          </dd>
        </div>
      </dl>
    </section>
  );
}
