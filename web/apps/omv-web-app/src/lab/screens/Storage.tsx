// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's storage page in three directions: development only (UI-11). Disks and file systems,
// drawn so that what sits on what is visible, with the worst first and the numbers always shown.
import { Copy, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Arrangement, DriveBay } from "../art.tsx";
import { DISK_ALERT_C } from "../chartModel.ts";
import {
  CapacityChart,
  CapacityTable,
  DiskTempChart,
  DiskTempTable,
} from "../charts.tsx";
import type { Disk } from "../data.ts";
import { percent, size } from "../data.ts";
import { reducedMotion } from "../motion.ts";
import { useLab } from "../state.ts";
import { DiskIcon, More, Pill, Ring } from "../ui.tsx";
import { cx, vars } from "../util.ts";
import { countBy, storageFlow } from "./model.ts";
import { CapacityRow, Card, CardHead, Flow } from "./parts.tsx";

const SERIAL: Record<string, string> = {
  nvme0n1: "EXAMPLE-SERIAL-0101",
  sda: "EXAMPLE-SERIAL-0140",
  sdb: "EXAMPLE-SERIAL-0141",
  sdc: "EXAMPLE-SERIAL-0142",
  sdd: "EXAMPLE-SERIAL-0143",
  sde: "EXAMPLE-SERIAL-0104",
};

function useArrival(id: string | null) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!id || !ref.current) {
      return;
    }
    ref.current.scrollIntoView({
      block: "center",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
    ref.current.classList.add("is-arrived");
  }, [id]);
  return ref;
}

/** A dense table with selection and a bulk action; technical columns are one switch away. */
function DiskTable({ highlightFs }: { highlightFs: string | null }) {
  const lab = useLab();
  const [selected, setSelected] = useState<string[]>([]);
  const [tech, setTech] = useState(false);
  const arrived = useArrival(lab.focusDisk);
  const all = lab.nas.disks.map((d) => d.id);
  const toggle = (id: string) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  };
  return (
    <div className="lx-tablewrap">
      <div className={cx("lx-toolbar", selected.length > 0 && "has-selection")}>
        {selected.length > 0 ? (
          <>
            <span className="lx-toolbar-count lx-num">
              {selected.length} selected
            </span>
            <button
              type="button"
              className="lx-btn lx-btn--secondary"
              onClick={() => {
                lab.toast(
                  `Quick health check started on ${selected.length} ${selected.length === 1 ? "disk" : "disks"}. It takes about 2 minutes.`,
                );
                setSelected([]);
              }}
            >
              <Stethoscope size={14} aria-hidden /> Run a quick health check
            </button>
            <button
              type="button"
              className="lx-btn lx-btn--quiet"
              onClick={() => {
                setSelected([]);
              }}
            >
              Clear
            </button>
          </>
        ) : (
          <span className="lx-toolbar-hint">
            Select disks to check several at once.
          </span>
        )}
        <label className="lx-check lx-toolbar-end">
          <input
            type="checkbox"
            checked={tech}
            onChange={(e) => {
              setTech(e.target.checked);
            }}
          />
          Technical columns
        </label>
      </div>
      <div
        className="lx-tablescroll"
        role="region"
        aria-label="Disks"
        tabIndex={0}
      >
        <table className="lx-table">
          <thead>
            <tr>
              <th scope="col" className="lx-col-check">
                <input
                  type="checkbox"
                  aria-label="Select all disks"
                  checked={selected.length === all.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selected.length > 0 && selected.length < all.length;
                    }
                  }}
                  onChange={(e) => {
                    setSelected(e.target.checked ? all : []);
                  }}
                />
              </th>
              <th scope="col">Disk</th>
              <th scope="col">Health</th>
              <th scope="col" className="lx-num-col">
                Temperature
              </th>
              <th scope="col" className="lx-num-col">
                Size
              </th>
              <th scope="col">Holds</th>
              {tech ? (
                <>
                  <th scope="col">Model</th>
                  <th scope="col">Serial number</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lab.nas.disks.map((d, i) => (
              <tr
                key={d.id}
                ref={
                  d.id === lab.focusDisk
                    ? (el) => {
                        arrived.current = el;
                      }
                    : undefined
                }
                className={cx(
                  "lx-enter",
                  selected.includes(d.id) && "is-selected",
                  highlightFs && (d.fs === highlightFs ? "is-lit" : "is-dim"),
                )}
                style={vars({ "--i": i })}
              >
                <td className="lx-col-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.device}`}
                    checked={selected.includes(d.id)}
                    onChange={() => {
                      toggle(d.id);
                    }}
                  />
                </td>
                <td>
                  <span className="lx-cell-main lx-mono">{d.device}</span>
                  {!tech ? (
                    <span className="lx-cell-sub">{d.model}</span>
                  ) : null}
                </td>
                <td>
                  <Pill status={d.status} />
                  {d.status !== "ok" ? (
                    <span className="lx-cell-sub">{d.note}</span>
                  ) : null}
                </td>
                <td className="lx-num-col lx-num">
                  {d.temp === null ? "Not reported" : `${d.temp}\u00a0°C`}
                </td>
                <td className="lx-num-col lx-num">{d.size}</td>
                <td>{d.role}</td>
                {tech ? (
                  <>
                    <td>{d.model}</td>
                    <td>
                      <span className="lx-mono lx-copyable">
                        {SERIAL[d.id]}
                        <button
                          type="button"
                          className="lx-iconbtn lx-iconbtn--sm"
                          aria-label={`Copy the serial number of ${d.device}`}
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              SERIAL[d.id] ?? "",
                            );
                            lab.toast("Serial number copied.");
                          }}
                        >
                          <Copy size={13} aria-hidden />
                        </button>
                      </span>
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StorageHead({ children }: { children?: ReactNode }) {
  const lab = useLab();
  const total = lab.nas.fileSystems.reduce((s, f) => s + f.sizeTiB, 0);
  const used = lab.nas.fileSystems.reduce((s, f) => s + f.usedTiB, 0);
  return (
    <header className="lx-pagehead lx-enter">
      <p className="lx-crumbs">Storage</p>
      <h1 className="lx-h1">Disks and file systems</h1>
      <p className="lx-pagemeta lx-num">
        {lab.nas.disks.length} disks · {lab.nas.fileSystems.length} file systems
        · {size(used)} of {size(total)} used
      </p>
      {children}
    </header>
  );
}

/** The two storage charts' contents: a heading, the chart with its sentence, the table one click away. */
function SpaceChart({
  heading,
}: {
  heading: (title: string, meta: string) => ReactNode;
}) {
  const lab = useLab();
  const total = lab.nas.fileSystems.reduce((s, f) => s + f.sizeTiB, 0);
  const used = lab.nas.fileSystems.reduce((s, f) => s + f.usedTiB, 0);
  const largest = [...lab.nas.fileSystems].sort(
    (a, b) => b.sizeTiB - a.sizeTiB,
  )[0];
  const full = lab.nas.fileSystems.filter(
    (f) => percent(f.usedTiB, f.sizeTiB) >= 85,
  );
  return (
    <>
      {heading("Where the space is", "Every file system to one scale")}
      <figure className="lx-chartfig" aria-labelledby="lx-cap-cap">
        <CapacityChart
          fileSystems={lab.nas.fileSystems}
          label="Space by file system"
        />
        <figcaption id="lx-cap-cap" className="lx-vh">
          {`Space by file system: ${size(used)} of ${size(total)} used. The largest is ${largest?.label ?? ""} at ${size(largest?.sizeTiB ?? 0)}.${full.length > 0 ? ` Almost full: ${full.map((f) => f.label).join(", ")}.` : ""}`}
        </figcaption>
      </figure>
      <More summary="Show as a table">
        <CapacityTable fileSystems={lab.nas.fileSystems} />
      </More>
    </>
  );
}

function TempChart({
  heading,
}: {
  heading: (title: string, meta: string) => ReactNode;
}) {
  const lab = useLab();
  const read = lab.nas.disks.filter((d) => d.temp !== null);
  const hottest = [...read].sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0))[0];
  const over = read.filter((d) => (d.temp ?? 0) >= DISK_ALERT_C);
  const silent = lab.nas.disks.filter((d) => d.temp === null);
  return (
    <>
      {heading("Disk temperatures", `Now · alert at ${DISK_ALERT_C}\u00a0°C`)}
      <figure className="lx-chartfig" aria-labelledby="lx-temp-cap">
        <DiskTempChart disks={lab.nas.disks} />
        <figcaption id="lx-temp-cap" className="lx-vh">
          {`Disk temperatures now. The warmest is ${hottest?.device ?? ""} at ${hottest?.temp ?? 0} °C. ${over.length === 0 ? "All are" : `${over.map((d) => d.device).join(", ")} ${over.length === 1 ? "is" : "are"} not`} below the alert temperature of ${DISK_ALERT_C} °C.${silent.length > 0 ? ` No reading from ${silent.map((d) => d.device).join(", ")}.` : ""}`}
        </figcaption>
      </figure>
      <More summary="Show as a table">
        <DiskTempTable disks={lab.nas.disks} />
      </More>
    </>
  );
}

function cardHeading(title: string, meta: string) {
  return <CardHead title={title} meta={meta} />;
}

function atlasHeading(title: string, meta: string) {
  return (
    <header className="lx-atlas-charthead">
      <h3 className="lx-h3">{title}</h3>
      <p className="lx-hint">{meta}</p>
    </header>
  );
}

function InstrumentStorage() {
  const lab = useLab();
  const [fs, setFs] = useState<string | null>(null);
  return (
    <div className="lx-page">
      <StorageHead />
      <div className="lx-grid">
        <Card
          className="lx-span-12 lx-baycard"
          label="The disks in this NAS"
          i={0}
        >
          <CardHead
            title="In the NAS"
            meta="Slot lights show each disk's health"
          />
          <DriveBay disks={lab.nas.disks} focus={lab.focusDisk} />
        </Card>
        <Card className="lx-span-12" label="File systems" i={0}>
          <CardHead title="File systems" meta="Point at one to see its disks" />
          <div className="lx-caplist">
            {lab.nas.fileSystems.map((f) => (
              <div
                key={f.id}
                className="lx-hoverrow"
                onPointerEnter={() => {
                  setFs(f.id);
                }}
                onPointerLeave={() => {
                  setFs(null);
                }}
              >
                <CapacityRow fs={f} segments={40} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="lx-span-7" label="Where the space is" i={1}>
          <SpaceChart heading={cardHeading} />
        </Card>
        <Card className="lx-span-5" label="Disk temperatures" i={1}>
          <TempChart heading={cardHeading} />
        </Card>
        <Card className="lx-span-12" label="Disks" i={1}>
          <CardHead title="Disks" meta={countBy(lab.nas.disks)} />
          <DiskTable highlightFs={fs} />
          <More summary="What does Health mean?">
            <p>
              Each disk reports on itself (S.M.A.R.T.). <strong>OK</strong>{" "}
              means it reports no problems. <strong>Warning</strong> means it
              still works but is wearing: copy what is on it and plan a
              replacement. <strong>Unknown</strong> means the disk gives no
              readings, which is common over USB.
            </p>
          </More>
        </Card>
        <Card className="lx-span-12" label="How pool is arranged" i={2}>
          <CardHead
            title="How pool keeps your data"
            meta="Mirror of sdc and sdd"
          />
          <Arrangement current="mirror" />
        </Card>
      </div>
    </div>
  );
}

function SkyDisk({ d }: { d: Disk }) {
  const lab = useLab();
  const arrived = useArrival(d.id === lab.focusDisk ? d.id : null);
  return (
    <li
      className={cx("lx-diskcard", `is-${d.status}`)}
      ref={(el) => {
        arrived.current = el;
      }}
    >
      <DiskIcon kind={d.kind} />
      <div className="lx-diskcard-body">
        <p className="lx-diskcard-name">
          <span className="lx-mono">{d.device}</span>
          <Pill status={d.status} />
        </p>
        <p className="lx-diskcard-model">
          {d.model} · {d.size}
        </p>
        <p className="lx-diskcard-note">
          {d.status === "ok" ? `Holds ${d.role}` : d.note}
          {d.temp !== null ? (
            <span className="lx-num"> · {d.temp}&nbsp;°C</span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function SkyStorage() {
  const lab = useLab();
  const total = lab.nas.fileSystems.reduce((s, f) => s + f.sizeTiB, 0);
  const used = lab.nas.fileSystems.reduce((s, f) => s + f.usedTiB, 0);
  return (
    <div className="lx-page">
      <section
        className="lx-hero lx-hero--compact lx-enter lx-loadable"
        aria-labelledby="lx-st-h"
      >
        <div className="lx-hero-text">
          <p className="lx-hero-kicker">Storage</p>
          <h1 className="lx-hero-h" id="lx-st-h">
            {size(total - used)} free
          </h1>
          <p className="lx-hero-sub lx-num">
            {size(used)} of {size(total)} used across{" "}
            {lab.nas.fileSystems.length} file systems on {lab.nas.disks.length}{" "}
            disks.
          </p>
        </div>
        <Ring
          value={used / total}
          size={120}
          stroke={11}
          label={`${percent(used, total)}% of all storage used`}
        >
          <span className="lx-hero-ringnum lx-num">
            {percent(used, total)}%
          </span>
          <span className="lx-hero-ringcap">used</span>
        </Ring>
      </section>
      <h2 className="lx-h2 lx-enter">File systems</h2>
      <ul className="lx-fscards">
        {lab.nas.fileSystems.map((f, i) => {
          const pct = percent(f.usedTiB, f.sizeTiB);
          return (
            <li
              key={f.id}
              className={cx(
                "lx-card lx-fscard lx-enter lx-loadable",
                `is-${f.status}`,
              )}
              style={vars({ "--i": i })}
            >
              <Ring
                value={f.usedTiB / f.sizeTiB}
                status={pct >= 85 ? "warning" : "ok"}
                size={72}
                stroke={7}
                label={`${f.label}: ${pct}% full`}
              >
                <span className="lx-num lx-ringpct">{pct}%</span>
              </Ring>
              <div className="lx-fscard-body">
                <p className="lx-fscard-name">
                  {f.label}
                  {f.status !== "ok" ? (
                    <Pill status={f.status}>
                      {pct >= 85 ? "Almost full" : undefined}
                    </Pill>
                  ) : null}
                </p>
                <p className="lx-fscard-fig lx-num">
                  {size(f.usedTiB)} of {size(f.sizeTiB)}
                </p>
                <p className="lx-fscard-sub">
                  {f.type} · {f.layout}
                  {f.folders.length > 0
                    ? ` · ${f.folders.length} shared ${f.folders.length === 1 ? "folder" : "folders"}`
                    : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="lx-grid lx-chartrow">
        <Card className="lx-span-7" label="Where the space is" i={2}>
          <SpaceChart heading={cardHeading} />
        </Card>
        <Card className="lx-span-5" label="Disk temperatures" i={3}>
          <TempChart heading={cardHeading} />
        </Card>
      </div>
      <h2 className="lx-h2 lx-enter">Disks</h2>
      <div className="lx-card lx-enter lx-loadable lx-baycard">
        <DriveBay disks={lab.nas.disks} focus={lab.focusDisk} />
      </div>
      <ul className="lx-diskcards">
        {lab.nas.disks.map((d) => (
          <SkyDisk key={d.id} d={d} />
        ))}
      </ul>
      <h2 className="lx-h2 lx-enter">How pool keeps your data</h2>
      <div className="lx-card lx-enter lx-loadable">
        <Arrangement current="mirror" />
      </div>
    </div>
  );
}

function AtlasStorage() {
  const lab = useLab();
  return (
    <div className="lx-page">
      <StorageHead>
        <p className="lx-hint">
          Point at or tab to anything to trace what depends on it. Photos opens
          its page.
        </p>
      </StorageHead>
      <section
        className="lx-atlas-sec lx-loadable"
        aria-label="Map of disks, file systems and shared folders"
      >
        <Flow
          columns={storageFlow(
            lab.nas,
            () => {
              lab.go("folder");
            },
            false,
          )}
        />
      </section>
      <section
        className="lx-atlas-sec lx-loadable"
        aria-labelledby="lx-as-space"
      >
        <h2 className="lx-h2" id="lx-as-space">
          <span className="lx-h2-num">01</span> Space and temperature
        </h2>
        <div className="lx-atlas-cols lx-atlas-charts">
          <div className="lx-atlas-chart">
            <SpaceChart heading={atlasHeading} />
          </div>
          <div className="lx-atlas-chart">
            <TempChart heading={atlasHeading} />
          </div>
        </div>
      </section>
      <section
        className="lx-atlas-sec lx-loadable"
        aria-labelledby="lx-as-disks"
      >
        <h2 className="lx-h2" id="lx-as-disks">
          <span className="lx-h2-num">02</span> Disks{" "}
          <span className="lx-h2-meta">{countBy(lab.nas.disks)}</span>
        </h2>
        <DiskTable highlightFs={null} />
      </section>
      <section className="lx-atlas-sec lx-loadable" aria-labelledby="lx-as-arr">
        <h2 className="lx-h2" id="lx-as-arr">
          <span className="lx-h2-num">03</span> How pool keeps your data{" "}
          <span className="lx-h2-meta">Mirror of sdc and sdd</span>
        </h2>
        <Arrangement current="mirror" />
      </section>
    </div>
  );
}

export function Storage() {
  const lab = useLab();
  if (lab.dir === "sky") {
    return <SkyStorage />;
  }
  if (lab.dir === "atlas") {
    return <AtlasStorage />;
  }
  return <InstrumentStorage />;
}
