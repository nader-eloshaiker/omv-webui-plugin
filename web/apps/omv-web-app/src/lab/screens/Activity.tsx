// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's Performance page (Diagnostics): development only (UI-11). What a statistics page can be
// when OMV keeps no history as numbers (A7): the samples this session has taken, up to ten minutes,
// one chart per metric on one time axis, pointing at one shows the same moment in all of them. Each
// chart has its figures over the span shown (now, average, highest, lowest) and its numbers as a
// table. Past days stay in the classic interface, which draws them from its own graph files.
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Metric, MetricDef } from "../chartModel.ts";
import {
  fmt,
  inView,
  liveSummary,
  metricDefs,
  METRICS,
  sampledSeconds,
  spanWords,
  stats,
} from "../chartModel.ts";
import { LiveChart, LiveTable, Swatch } from "../charts.tsx";
import type { Sample } from "../live.ts";
import { SAMPLE_MS, SESSION_KEEP, useSamples } from "../live.ts";
import { reducedMotion } from "../motion.ts";
import { useLab } from "../state.ts";
import { More } from "../ui.tsx";
import { cx, vars } from "../util.ts";

const SPANS = [
  { s: 60, label: "1 min" },
  { s: 300, label: "5 min" },
  { s: (SESSION_KEEP * SAMPLE_MS) / 1000, label: "10 min" },
] as const;

function Figures({
  def,
  samples,
  windowS,
}: {
  def: MetricDef;
  samples: Sample[];
  windowS: number;
}) {
  const last = samples.at(-1)?.t ?? 0;
  const seen = samples.filter((s) => s.t >= last - windowS * 1000);
  return (
    <div className="lx-perf-figs">
      {def.series.map((series) => {
        const v = stats(seen.map((s) => s[series.key]));
        return (
          <dl key={series.key} className="lx-perf-fig">
            {def.series.length > 1 ? (
              <div className="lx-perf-fig-series">
                <dt className="lx-vh">Series</dt>
                <dd>
                  <Swatch tone={series.tone} dash={series.dash} />
                  {series.name}
                </dd>
              </div>
            ) : null}
            <div className="lx-perf-fig-now">
              <dt>Now</dt>
              <dd className="lx-num">{fmt(v.now, def)}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd className="lx-num">{fmt(v.mean, def)}</dd>
            </div>
            <div>
              <dt>Highest</dt>
              <dd className="lx-num">{fmt(v.high, def)}</dd>
            </div>
            <div>
              <dt>Lowest</dt>
              <dd className="lx-num">{fmt(v.low, def)}</dd>
            </div>
          </dl>
        );
      })}
    </div>
  );
}

function MetricBlock({
  def,
  samples,
  windowS,
  index,
  arrived,
}: {
  def: MetricDef;
  samples: Sample[];
  windowS: number;
  index: number;
  arrived: boolean;
}) {
  const lab = useLab();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!arrived || !ref.current) {
      return;
    }
    ref.current.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
    ref.current.classList.add("is-arrived");
  }, [arrived]);
  const headId = `lx-perf-${def.id}`;
  const capId = `${headId}-cap`;
  const body = (
    <>
      <div className="lx-perf-top">
        <header className="lx-perf-head">
          <h2
            className={cx(
              lab.dir === "atlas" ? "lx-h2" : "lx-cardtitle",
              "lx-perf-title",
            )}
            id={headId}
          >
            {lab.dir === "atlas" ? (
              <span className="lx-h2-num">{`0${index + 1}`}</span>
            ) : null}
            {def.name}
          </h2>
        </header>
        <Figures def={def} samples={samples} windowS={windowS} />
      </div>
      <figure className="lx-perf-chart" aria-labelledby={capId}>
        <LiveChart
          def={def}
          samples={samples}
          windowS={windowS}
          size="large"
          syncId="lx-perf"
        />
        <figcaption id={capId} className="lx-vh">
          {liveSummary(def, samples, windowS)}
        </figcaption>
      </figure>
      <More summary={`${def.name}: the numbers as a table`}>
        <LiveTable
          defs={[def]}
          samples={samples}
          windowS={windowS}
          caption={`${def.name}, every ${SAMPLE_MS / 1000} seconds, newest first`}
        />
      </More>
    </>
  );
  if (lab.dir === "atlas") {
    return (
      <section
        ref={ref}
        className="lx-atlas-sec lx-perf lx-loadable"
        aria-labelledby={headId}
      >
        {body}
      </section>
    );
  }
  return (
    <section
      ref={ref}
      className="lx-card lx-perf lx-enter lx-loadable"
      aria-labelledby={headId}
      style={vars({ "--i": index + 1 })}
    >
      {body}
    </section>
  );
}

export function Activity() {
  const lab = useLab();
  const samples = useSamples();
  const [windowS, setWindowS] = useState<number>(SPANS[1].s);
  const defs = metricDefs(lab.nas);
  const seen = inView(samples, windowS);
  const sampled = spanWords(sampledSeconds(seen, windowS));
  const session = spanWords(((samples.length - 1) * SAMPLE_MS) / 1000);
  const first: Metric | null = lab.focusMetric;
  return (
    <div className="lx-page lx-perfpage">
      <header className="lx-pagehead lx-enter">
        <p className="lx-crumbs">Diagnostics</p>
        <h1 className="lx-h1">Performance</h1>
        <p className="lx-pagemeta">
          <span className="lx-livecap">
            <span className="lx-livedot" aria-hidden="true" />
            Live · every {SAMPLE_MS / 1000}&nbsp;s · showing {sampled} of the{" "}
            {session} sampled since you opened the interface
          </span>
        </p>
        <p className="lx-perf-note">
          The NAS does not keep these numbers, so this page shows only what it
          has measured while the interface is open, up to the last 10 minutes.
          Point at a chart, or tab to it and use the arrow keys, to read one
          moment in all four.
        </p>
        <div className="lx-perf-bar">
          <div className="lx-seg" role="group" aria-label="Time shown">
            {SPANS.map((span) => (
              <button
                key={span.s}
                type="button"
                className={cx("lx-seg-opt", windowS === span.s && "is-on")}
                aria-pressed={windowS === span.s}
                onClick={() => {
                  setWindowS(span.s);
                }}
              >
                Last {span.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="lx-link lx-perf-classic"
            onClick={() => {
              lab.notInLab("Past days in the classic interface");
            }}
          >
            Past days are in the classic interface
            <ExternalLink size={13} aria-hidden />
          </button>
        </div>
      </header>
      <div className="lx-perf-list">
        {METRICS.map((m, i) => (
          <MetricBlock
            key={m}
            def={defs[m]}
            samples={samples}
            windowS={windowS}
            index={i}
            arrived={first === m}
          />
        ))}
      </div>
    </div>
  );
}
