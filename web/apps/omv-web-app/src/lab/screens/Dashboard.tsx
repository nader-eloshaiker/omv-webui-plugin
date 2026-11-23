// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's dashboard in three directions: development only (UI-11). Each answers, in this order:
// is the NAS fine; if not, what needs me and what do I do; how full is it; is it busy right now.
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DriveBay } from "../art.tsx";
import { percent, size, STATUS_WORD } from "../data.ts";
import { useLab } from "../state.ts";
import { Mark, Pill, Ring } from "../ui.tsx";
import { cx, vars } from "../util.ts";
import { countBy, health, storageFlow } from "./model.ts";
import {
  AttentionList,
  CapacityRow,
  Card,
  CardHead,
  Flow,
  LiveCaption,
  LiveGrid,
  PendingSummary,
  ServiceList,
} from "./parts.tsx";

/**
 * First steps for a new owner: what to do next, why, and what pressing the button will do. It
 * reads the NAS's settings, so a done step is done; it folds away once dismissed.
 */
function FirstSteps({ i }: { i: number }) {
  const lab = useLab();
  const [hidden, setHidden] = useState(false);
  const steps = [
    {
      done: true,
      title: "Make a shared folder",
      why: "A place on the NAS that other computers can open.",
      action: "Add another",
    },
    {
      done: true,
      title: "Let people in",
      why: "alex, robin and sam can sign in from their computers.",
      action: "See people",
    },
    {
      done: false,
      title: "Get an email when something goes wrong",
      why: "A failing disk is easier to save when you hear about it early.",
      action: "Set up email alerts",
    },
    {
      done: false,
      title: "Turn on HTTPS",
      why: "So passwords typed here cannot be read on your network.",
      action: "Turn on HTTPS",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden) {
    return null;
  }
  return (
    <Card className="lx-steps" label="First steps" i={i}>
      <header className="lx-steps-head">
        <Ring
          value={done / steps.length}
          size={44}
          stroke={5}
          label={`${done} of ${steps.length} first steps done`}
        >
          <span className="lx-num lx-steps-count">
            {done}/{steps.length}
          </span>
        </Ring>
        <div>
          <h2 className="lx-cardtitle">First steps</h2>
          <p className="lx-cardmeta">
            Four things that make a new NAS safe to rely on.
          </p>
        </div>
        <button
          type="button"
          className="lx-btn lx-btn--quiet"
          onClick={() => {
            setHidden(true);
            lab.toast("First steps hidden. They are under Overview in search.");
          }}
        >
          Hide
        </button>
      </header>
      <ol className="lx-steps-list">
        {steps.map((s) => (
          <li key={s.title} className={cx("lx-step", s.done && "is-done")}>
            <span className="lx-step-mark" aria-hidden="true">
              {s.done ? <Check size={13} /> : null}
            </span>
            <div className="lx-step-body">
              <p className="lx-step-title">
                {s.title}
                {s.done ? <span className="lx-vh"> (done)</span> : null}
              </p>
              <p className="lx-step-why">{s.why}</p>
            </div>
            {!s.done ? (
              <button
                type="button"
                className="lx-btn lx-btn--secondary lx-step-go"
                onClick={() => {
                  lab.notInLab(s.title);
                }}
              >
                {s.action}
                <ArrowRight size={14} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function DiskBay() {
  const lab = useLab();
  return (
    <ul className="lx-bay">
      {lab.nas.disks.map((d, i) => (
        <li
          key={d.id}
          className={cx("lx-sled", `is-${d.status}`)}
          style={vars({ "--i": i })}
        >
          <span className="lx-sled-led">
            <Mark status={d.status} size={12} />
          </span>
          <span className="lx-sled-dev lx-mono">{d.device}</span>
          <span className="lx-sled-role">{d.role}</span>
          <span className="lx-sled-temp lx-num">
            {d.temp === null ? "–" : `${d.temp}\u00a0°C`}
          </span>
          <span className="lx-vh">{STATUS_WORD[d.status]}</span>
        </li>
      ))}
    </ul>
  );
}

function SystemFacts() {
  const lab = useLab();
  return (
    <dl className="lx-facts">
      <div>
        <dt>Name</dt>
        <dd className="lx-mono">{lab.nas.host}</dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>{lab.nas.version}</dd>
      </div>
      <div>
        <dt>Running for</dt>
        <dd>{lab.nas.uptime}</dd>
      </div>
      <div>
        <dt>Updates</dt>
        <dd>33 available</dd>
      </div>
    </dl>
  );
}

function InstrumentDashboard() {
  const lab = useLab();
  const h = health(lab.nas);
  const n = lab.pending.length;
  const cells = [
    {
      name: "Disks",
      status: h.diskState,
      text: countBy(lab.nas.disks),
    },
    {
      name: "File systems",
      status: h.fsState,
      text: countBy(lab.nas.fileSystems),
    },
    { name: "Services", status: "ok" as const, text: "4 running · 1 off" },
    { name: "Network", status: "ok" as const, text: "eth0 · 1 Gbit/s" },
  ];
  return (
    <div className="lx-page">
      <header className="lx-pagehead lx-enter">
        <h1 className="lx-h1">Overview</h1>
        <p className="lx-pagemeta">
          <span className="lx-mono">{lab.nas.host}</span> · up {lab.nas.uptime}{" "}
          · read 10:42:07
        </p>
      </header>
      <Card className="lx-strip" label="Health" i={0}>
        <div className={cx("lx-strip-main", `is-${h.overall}`)}>
          <Mark status={h.overall} size={22} />
          <div>
            <p className="lx-strip-word">{STATUS_WORD[h.overall]}</p>
            <p className="lx-strip-head">{h.headline}</p>
          </div>
        </div>
        {cells.map((c) => (
          <button
            key={c.name}
            type="button"
            className={cx("lx-strip-cell", `is-${c.status}`)}
            onClick={() => {
              if (c.name === "Disks" || c.name === "File systems") {
                lab.go("storage");
              } else {
                lab.notInLab(c.name);
              }
            }}
          >
            <span className="lx-strip-name">
              {c.name}
              <ChevronRight size={14} aria-hidden className="lx-strip-chev" />
            </span>
            <span className="lx-strip-state">
              <Mark status={c.status} size={14} /> {STATUS_WORD[c.status]}
            </span>
            <span className="lx-strip-text">{c.text}</span>
          </button>
        ))}
        <div
          className={cx("lx-strip-cell lx-strip-pend", n > 0 && "is-pending")}
        >
          <span className="lx-strip-name">Pending</span>
          <span className="lx-strip-state">
            {n > 0 ? <Mark status="pending" size={14} /> : null}{" "}
            {n > 0 ? `${n} to apply` : "None"}
          </span>
          <span className="lx-strip-text">
            {n > 0 ? lab.pending.join(", ") : "Settings in use"}
          </span>
        </div>
      </Card>
      <div className="lx-grid">
        <Card className="lx-span-8 lx-card--fill" label="Activity" i={1}>
          <CardHead title="Activity" meta={<LiveCaption />} />
          <LiveGrid variant="readout" />
        </Card>
        <Card className="lx-span-4" label="Needs attention" i={2}>
          <CardHead
            title="Needs attention"
            meta={`${lab.nas.attention.length}`}
          />
          <AttentionList items={lab.nas.attention} />
        </Card>
        <Card className="lx-span-7" label="Storage" i={3}>
          <CardHead
            title="Storage"
            meta={`${lab.nas.fileSystems.length} file systems`}
          >
            <button
              type="button"
              className="lx-link lx-cardlink"
              onClick={() => {
                lab.go("storage");
              }}
            >
              Open storage <ArrowRight size={14} aria-hidden />
            </button>
          </CardHead>
          <div className="lx-caplist">
            {lab.nas.fileSystems.map((fs) => (
              <CapacityRow key={fs.id} fs={fs} segments={24} />
            ))}
          </div>
        </Card>
        <Card className="lx-span-5" label="Disks" i={4}>
          <CardHead title="Disks" meta={countBy(lab.nas.disks)} />
          <DiskBay />
        </Card>
        <FirstSteps i={5} />
        <Card className="lx-span-4" label="Services" i={6}>
          <CardHead title="Services" />
          <ServiceList />
        </Card>
        <Card className="lx-span-3" label="This NAS" i={7}>
          <CardHead title="This NAS" />
          <SystemFacts />
        </Card>
      </div>
    </div>
  );
}

function SkyDashboard() {
  const lab = useLab();
  const h = health(lab.nas);
  const total = lab.nas.fileSystems.reduce((s, f) => s + f.sizeTiB, 0);
  const used = lab.nas.fileSystems.reduce((s, f) => s + f.usedTiB, 0);
  const segments = [
    { name: "Disks", status: h.diskState },
    { name: "File systems", status: h.fsState },
    { name: "Services", status: "ok" as const },
    { name: "Network", status: "ok" as const },
  ];
  return (
    <div className="lx-page">
      <section
        className={cx("lx-hero lx-enter lx-loadable", `is-${h.overall}`)}
        aria-labelledby="lx-hero-h"
      >
        <div className="lx-hero-text">
          <p className="lx-hero-kicker">
            <Mark status={h.overall} size={16} /> {STATUS_WORD[h.overall]} ·{" "}
            {lab.nas.host}
          </p>
          <h1 className="lx-hero-h" id="lx-hero-h">
            {h.headline}
          </h1>
          <p className="lx-hero-sub">
            {h.needs.length > 0
              ? "Your files are safe right now. Both items below have a next step."
              : h.overall === "unknown"
                ? "Everything that reports its health is OK. sde is connected over USB and gives no health readings, so it shows as Unknown."
                : "Disks, file systems and services were all checked a moment ago."}
          </p>
        </div>
        <Ring
          value={1}
          size={148}
          stroke={12}
          label={`Health: ${segments.map((s) => `${s.name} ${STATUS_WORD[s.status]}`).join(", ")}`}
          segments={segments.map((s) => ({ value: 25, status: s.status }))}
        >
          <span className="lx-hero-ringnum lx-num">
            {segments.filter((s) => s.status === "ok").length}/4
          </span>
          <span className="lx-hero-ringcap">areas OK</span>
        </Ring>
        <ul className="lx-hero-legend">
          {segments.map((s) => (
            <li key={s.name}>
              <Mark status={s.status} size={14} />
              {s.name}
              <span className="lx-hero-legend-word">
                {STATUS_WORD[s.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {lab.nas.attention.length > 0 ? (
        <section className="lx-attn-cards" aria-label="Needs your attention">
          <AttentionList items={lab.nas.attention} />
        </section>
      ) : null}
      <div className="lx-grid">
        <Card className="lx-span-6" label="Storage" i={1}>
          <CardHead
            title="Storage"
            meta={`${size(used)} of ${size(total)} used`}
          >
            <button
              type="button"
              className="lx-link lx-cardlink"
              onClick={() => {
                lab.go("storage");
              }}
            >
              Open <ArrowRight size={14} aria-hidden />
            </button>
          </CardHead>
          <ul className="lx-ringrow">
            {lab.nas.fileSystems.slice(0, 4).map((fs) => {
              const pct = percent(fs.usedTiB, fs.sizeTiB);
              return (
                <li key={fs.id}>
                  <Ring
                    value={fs.usedTiB / fs.sizeTiB}
                    status={pct >= 85 ? "warning" : "ok"}
                    size={84}
                    stroke={8}
                    label={`${fs.label}: ${pct}% full`}
                  >
                    <span className="lx-num lx-ringpct">{pct}%</span>
                  </Ring>
                  <span className="lx-ringrow-name">{fs.label}</span>
                  <span className="lx-ringrow-sub lx-num">
                    {size(fs.sizeTiB - fs.usedTiB)} free
                  </span>
                  {fs.status !== "ok" ? (
                    <Pill status={fs.status}>
                      {pct >= 85 ? "Almost full" : undefined}
                    </Pill>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="lx-span-6" label="Activity" i={2}>
          <CardHead title="Right now" meta={<LiveCaption />} />
          <LiveGrid variant="soft" />
        </Card>
        <FirstSteps i={3} />
        <Card className="lx-span-6" label="Disks" i={4}>
          <CardHead title="Disks" meta={countBy(lab.nas.disks)} />
          <DriveBay disks={lab.nas.disks} compact />
        </Card>
        <Card className="lx-span-6" label="Services" i={5}>
          <CardHead title="Sharing and services" />
          <ServiceList />
        </Card>
      </div>
    </div>
  );
}

function AtlasDashboard() {
  const lab = useLab();
  const h = health(lab.nas);
  return (
    <div className="lx-page">
      <header className="lx-atlas-head lx-enter">
        <p className="lx-kicker">
          <Mark status={h.overall} size={14} /> {STATUS_WORD[h.overall]} ·{" "}
          <span className="lx-mono">{lab.nas.host}</span> · up {lab.nas.uptime}
        </p>
        <h1 className="lx-display">{h.headline}.</h1>
      </header>
      <section className="lx-atlas-band lx-loadable" aria-label="Activity">
        <LiveGrid variant="figure" />
        <LiveCaption />
      </section>
      <div className="lx-atlas-cols">
        <section
          className="lx-atlas-sec lx-loadable"
          aria-labelledby="lx-a-attn"
        >
          <h2 className="lx-h2" id="lx-a-attn">
            <span className="lx-h2-num">01</span> What needs you
          </h2>
          <AttentionList items={lab.nas.attention} numbered />
        </section>
        <section
          className="lx-atlas-sec lx-loadable"
          aria-labelledby="lx-a-pend"
        >
          <h2 className="lx-h2" id="lx-a-pend">
            <span className="lx-h2-num">02</span> Waiting to apply
          </h2>
          <PendingSummary />
          <h2 className="lx-h2 lx-h2--next" id="lx-a-svc">
            <span className="lx-h2-num">03</span> Services
          </h2>
          <ServiceList />
        </section>
      </div>
      <section className="lx-atlas-sec lx-loadable" aria-labelledby="lx-a-map">
        <div className="lx-h2row">
          <h2 className="lx-h2" id="lx-a-map">
            <span className="lx-h2-num">04</span> How your storage fits together
          </h2>
          <p className="lx-hint">
            Point at anything to see what depends on it.
          </p>
        </div>
        <Flow
          columns={storageFlow(
            lab.nas,
            () => {
              lab.go("folder");
            },
            true,
          )}
          compact
        />
      </section>
      <FirstSteps i={4} />
      <section className="lx-atlas-sec lx-loadable" aria-labelledby="lx-a-cap">
        <h2 className="lx-h2" id="lx-a-cap">
          <span className="lx-h2-num">05</span> Space
        </h2>
        <div className="lx-caplist lx-caplist--wide">
          {lab.nas.fileSystems.map((fs) => (
            <CapacityRow
              key={fs.id}
              fs={fs}
              onOpen={() => {
                lab.go("storage");
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function Dashboard() {
  const lab = useLab();
  if (lab.dir === "sky") {
    return <SkyDashboard />;
  }
  if (lab.dir === "atlas") {
    return <AtlasDashboard />;
  }
  return <InstrumentDashboard />;
}
