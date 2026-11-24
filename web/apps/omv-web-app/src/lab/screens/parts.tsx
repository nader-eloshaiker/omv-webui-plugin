// SPDX-License-Identifier: GPL-3.0-or-later
// Parts the lab's three directions share: development only (UI-11).
import { ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyPending } from "../art.tsx";
import type { MetricDef } from "../chartModel.ts";
import { liveSummary, metricDefs, spanWords } from "../chartModel.ts";
import { LiveChart, LiveTable, Swatch } from "../charts.tsx";
import type { Attention, FileSystem, Status } from "../data.ts";
import { percent, size, STATUS_WORD, worst } from "../data.ts";
import { SAMPLE_MS } from "../live.ts";
import { useLab } from "../state.ts";
import { Live, Mark, Meter, More, Pill } from "../ui.tsx";
import { cx, vars } from "../util.ts";
import type { FlowNode } from "./model.ts";
import { useLiveFigures } from "./model.ts";

export function Card({
  className,
  children,
  label,
  i = 0,
  id,
}: {
  className?: string;
  children: ReactNode;
  label?: string;
  i?: number;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cx("lx-card lx-enter lx-loadable", className)}
      aria-label={label}
      style={vars({ "--i": i })}
    >
      {children}
    </section>
  );
}

export function CardHead({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="lx-cardhead">
      <h2 className="lx-cardtitle">{title}</h2>
      {meta ? <span className="lx-cardmeta">{meta}</span> : null}
      {children}
    </header>
  );
}

export function LiveCaption({ windowS }: { windowS?: number }) {
  const f = useLiveFigures(windowS);
  return (
    <span className="lx-livecap">
      <span className="lx-livedot" aria-hidden="true" />
      Live · every {SAMPLE_MS / 1000}&nbsp;s · last {spanWords(f.seconds)} on
      this page
    </span>
  );
}

/**
 * The dashboard's "right now": four live charts of the last minute this page sampled, each with its
 * reading above it, a sentence for screen readers, and one table of all the numbers below. Each
 * chart's name opens the Performance page at that metric.
 */
export function LiveGrid({
  variant,
}: {
  variant: "readout" | "soft" | "figure";
}) {
  const lab = useLab();
  const f = useLiveFigures();
  const defs = metricDefs(lab.nas);
  const memTotal = lab.nas.memTotalGiB;
  const tiles: { def: MetricDef; value: ReactNode; sub: ReactNode }[] = [
    {
      def: defs.cpu,
      value: <Live value={f.latest.cpu} unit="%" />,
      sub: `${lab.nas.cores} cores · load ${f.latest.load.toFixed(2)}`,
    },
    {
      def: defs.mem,
      value: <Live value={f.latest.memGiB} digits={1} unit="GiB" />,
      sub: `of ${memTotal.toFixed(1)}\u00a0GiB · ${percent(f.latest.memGiB, memTotal)}% in use`,
    },
    {
      def: defs.net,
      value: (
        <>
          <span className="lx-livetile-dir">in</span>
          <Live value={f.latest.rxMiB} digits={1} unit="MiB/s" />
        </>
      ),
      sub: (
        <span className="lx-livetile-legend">
          <span>
            <Swatch tone="s1" /> In
          </span>
          <span>
            <Swatch tone="s2" dash /> Out{" "}
            <Live value={f.latest.txMiB} digits={1} unit="MiB/s" />
          </span>
          <span className="lx-mono">eth0</span>
        </span>
      ),
    },
    {
      def: defs.temp,
      value: <Live value={f.latest.cpuTemp} unit="°C" />,
      sub: "Normal below 80\u00a0°C",
    },
  ];
  return (
    <div className={`lx-live lx-live--${variant}`}>
      <div className="lx-live-tiles">
        {tiles.map((t) => {
          const capId = `lx-live-${t.def.id}`;
          return (
            <figure
              key={t.def.id}
              className="lx-livetile"
              aria-labelledby={capId}
            >
              <button
                type="button"
                className="lx-livetile-name"
                onClick={() => {
                  lab.go("activity", { metric: t.def.id });
                }}
              >
                {t.def.name}
                <ChevronRight
                  size={14}
                  aria-hidden
                  className="lx-livetile-chev"
                />
                <span className="lx-vh"> (open in Performance)</span>
              </button>
              <div className="lx-livetile-value">{t.value}</div>
              <div className="lx-livetile-chart">
                <LiveChart
                  def={t.def}
                  samples={f.samples}
                  windowS={f.windowS}
                />
              </div>
              <div className="lx-livetile-sub">{t.sub}</div>
              <figcaption id={capId} className="lx-vh">
                {liveSummary(t.def, f.samples, f.windowS)}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <More summary="Show the numbers as a table">
        <LiveTable
          defs={[defs.cpu, defs.mem, defs.net, defs.temp]}
          samples={f.samples}
          windowS={f.windowS}
          caption={`Readings sampled every ${SAMPLE_MS / 1000} seconds over the last ${spanWords(f.seconds)} on this page, newest first`}
        />
      </More>
    </div>
  );
}

export function AttentionList({
  items,
  numbered,
}: {
  items: Attention[];
  numbered?: boolean;
}) {
  const lab = useLab();
  if (items.length === 0) {
    return (
      <p className="lx-empty">
        Nothing needs you. Disks, file systems and services are all OK.
      </p>
    );
  }
  return (
    <ol className={cx("lx-attn", numbered && "lx-attn--numbered")}>
      {items.map((a, i) => (
        <li
          key={a.id}
          className={`lx-attn-item lx-attn-item--${a.status} lx-enter`}
          style={vars({ "--i": i + 2 })}
        >
          <span className="lx-attn-mark">
            <Mark status={a.status} size={18} />
          </span>
          <div className="lx-attn-body">
            <p className="lx-attn-title">
              {a.status !== "setup" ? (
                <span className="lx-vh">{STATUS_WORD[a.status]}: </span>
              ) : null}
              {a.title}
            </p>
            <p className="lx-attn-text">{a.body}</p>
            {a.target === "classic" ? (
              <a
                className="lx-link"
                href="/#/system/workbench"
                target="_blank"
                rel="noopener noreferrer"
              >
                {a.action}
                <ExternalLink size={13} aria-hidden />
              </a>
            ) : (
              <button
                type="button"
                className="lx-link"
                onClick={() => {
                  lab.go(a.target === "folder" ? "folder" : "storage", {
                    disk: a.target === "storage" ? "sdb" : undefined,
                  });
                }}
              >
                {a.action}
                <ArrowRight size={14} aria-hidden />
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ServiceList() {
  const lab = useLab();
  return (
    <ul className="lx-services">
      {lab.nas.services.map((s) => (
        <li
          key={s.id}
          className={cx("lx-service", s.state === "off" && "is-off")}
        >
          <span
            className={cx("lx-service-led", s.state === "running" && "is-on")}
            aria-hidden="true"
          />
          <span className="lx-service-name">
            {s.plain}
            <span className="lx-service-tech">{s.name}</span>
          </span>
          <span className="lx-service-state">
            {s.state === "running" ? "Running" : "Off"}
          </span>
          <span className="lx-service-detail">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function PendingSummary() {
  const lab = useLab();
  const n = lab.pending.length;
  if (n === 0) {
    return <EmptyPending />;
  }
  return (
    <div className="lx-pendsum">
      <p>
        <Mark status="pending" size={16} />{" "}
        <strong>{n === 1 ? "1 change" : `${n} changes`}</strong> saved, not
        applied: {lab.pending.join(", ")}
      </p>
      <button
        type="button"
        className="lx-btn lx-btn--primary"
        disabled={lab.phase !== "idle"}
        onClick={lab.apply}
      >
        {lab.phase === "applying"
          ? "Applying…"
          : `Apply ${n === 1 ? "1 change" : `${n} changes`}`}
      </button>
    </div>
  );
}

export function CapacityRow({
  fs,
  segments,
  onOpen,
}: {
  fs: FileSystem;
  segments?: number;
  onOpen?: () => void;
}) {
  const pct = percent(fs.usedTiB, fs.sizeTiB);
  return (
    <div className={cx("lx-caprow", fs.status !== "ok" && `is-${fs.status}`)}>
      <div className="lx-caprow-head">
        <span className="lx-caprow-name">
          {onOpen ? (
            <button type="button" className="lx-plainlink" onClick={onOpen}>
              {fs.label}
            </button>
          ) : (
            fs.label
          )}
        </span>
        <span className="lx-caprow-type">
          {fs.type} · {fs.layout}
        </span>
        {fs.status !== "ok" ? (
          <Pill status={fs.status}>
            {pct >= 85 ? "Almost full" : STATUS_WORD[fs.status]}
          </Pill>
        ) : null}
        <span className="lx-caprow-fig lx-num">
          {size(fs.usedTiB)} <span className="lx-of">of</span>{" "}
          {size(fs.sizeTiB)}
          <span className="lx-caprow-pct">{pct}%</span>
        </span>
      </div>
      <Meter
        value={fs.usedTiB}
        max={fs.sizeTiB}
        status={pct >= 85 ? "warning" : "ok"}
        label={`${fs.label}: ${size(fs.usedTiB)} of ${size(fs.sizeTiB)} used, ${pct}%`}
        segments={segments}
      />
    </div>
  );
}

/**
 * The Atlas map: columns of things, each linked to what it feeds. Pointing at or focusing a node
 * lights its whole line of descent and dims the rest, which answers "what depends on this?". The
 * lines are measured from the laid-out nodes; under 720px they are dropped and each node says in
 * words what it feeds.
 */
export function Flow({
  columns,
  compact,
}: {
  columns: { title: string; nodes: FlowNode[] }[];
  compact?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<
    { from: string; to: string; d: string; status: Status; off: boolean }[]
  >([]);
  const [hot, setHot] = useState<string | null>(null);
  const shape = JSON.stringify(
    columns.map((c) => c.nodes.map((n) => [n.id, n.status, n.off, n.links])),
  );
  // The map is re-measured when its shape changes, not on every render of the page around it.
  const all = columns.flatMap((c) => c.nodes);
  const lineage = useMemo(() => {
    if (!hot) {
      return null;
    }
    const set = new Set([hot]);
    const down = (id: string) => {
      for (const n of all.filter((x) => x.id === id)) {
        for (const l of n.links) {
          set.add(l);
          down(l);
        }
      }
    };
    const up = (id: string) => {
      for (const n of all.filter((x) => x.links.includes(id))) {
        set.add(n.id);
        up(n.id);
      }
    };
    down(hot);
    up(hot);
    return set;
  }, [hot, shape]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const origin = el.getBoundingClientRect();
      const rect = (id: string) =>
        el.querySelector(`[data-node="${id}"]`)?.getBoundingClientRect();
      const out: typeof paths = [];
      for (const n of all) {
        const a = rect(n.id);
        for (const l of n.links) {
          const b = rect(l);
          if (!a || !b) {
            continue;
          }
          const x0 = a.right - origin.left;
          const y0 = a.top + a.height / 2 - origin.top;
          const x1 = b.left - origin.left;
          const y1 = b.top + b.height / 2 - origin.top;
          const mx = (x0 + x1) / 2;
          const target = all.find((x) => x.id === l);
          out.push({
            from: n.id,
            to: l,
            d: `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`,
            status: worst([
              n.status === "unknown" ? "ok" : n.status,
              target?.status === "unknown" ? "ok" : (target?.status ?? "ok"),
            ]),
            off: Boolean(n.off || target?.off),
          });
        }
      }
      setPaths(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [shape]);
  const nameOf = (id: string) => all.find((n) => n.id === id)?.label ?? id;
  return (
    <div
      className={cx(
        "lx-flow",
        compact && "lx-flow--compact",
        lineage && "is-tracing",
      )}
      ref={box}
    >
      <svg className="lx-flow-lines" aria-hidden="true">
        {paths.map((p, i) => (
          <path
            key={`${p.from}-${p.to}`}
            d={p.d}
            pathLength={1}
            className={cx(
              "lx-flow-path",
              `lx-flow-path--${p.status}`,
              p.off && "is-off",
              lineage && lineage.has(p.from) && lineage.has(p.to) && "is-lit",
            )}
            style={vars({ "--i": i })}
          />
        ))}
      </svg>
      {columns.map((col, ci) => (
        <div key={col.title} className="lx-flow-col">
          <h3 className="lx-flow-title">{col.title}</h3>
          <ul>
            {col.nodes.map((n, ni) => (
              <li
                key={n.id}
                className="lx-enter"
                style={vars({ "--i": ci * 2 + ni })}
              >
                <button
                  type="button"
                  data-node={n.id}
                  className={cx(
                    "lx-node",
                    `lx-node--${n.status}`,
                    lineage && (lineage.has(n.id) ? "is-lit" : "is-dim"),
                    n.kind && `lx-node--${n.kind}`,
                    n.off && "is-off",
                  )}
                  onPointerEnter={() => {
                    setHot(n.id);
                  }}
                  onPointerLeave={() => {
                    setHot(null);
                  }}
                  onFocus={() => {
                    setHot(n.id);
                  }}
                  onBlur={() => {
                    setHot(null);
                  }}
                  onClick={n.onOpen}
                  aria-description={
                    n.links.length > 0
                      ? `Feeds ${n.links.map(nameOf).join(", ")}`
                      : undefined
                  }
                >
                  <Mark status={n.status} size={14} />
                  <span className="lx-node-label">{n.label}</span>
                  <span className="lx-node-sub">{n.sub}</span>
                  {n.links.length > 0 ? (
                    <span className="lx-node-feeds">
                      → {n.links.map(nameOf).join(", ")}
                    </span>
                  ) : null}
                  <span className="lx-vh">{STATUS_WORD[n.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
