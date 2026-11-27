// SPDX-License-Identifier: GPL-3.0-or-later
// The chart prototype, in the lab: development only (UI-11). Round two (owner, 2026-11-26): the
// waffle for space, "Two charts, four series" for the live readouts. Round three: the drive
// pictures, a sheet of their own at the top of the temperatures. Round four: the temperatures by
// kind, with each RAID array and ZFS pool as a group, on the dashboard and on the Disks page; every
// bar and the waffle filled, with no outline. Each subject shows its chart with one sentence on what
// it shows and why, the page ends with them in place at the size they would have, and the candidates
// the owner did not pick are listed under "Not chosen", one line each.
//
// The query string selects what is shown and never acts (UI-4): screen=charts, theme=dark|light,
// density=comfortable|compact, width=full|900|390 (frames the page), motion=full|reduced, still=1 (a
// fixed set of 40 readings, paused, for screenshots), copy=1 (the Data drive read after a 1 TiB
// copy), disks=24 (24 disks instead of six), chrome=0 hides the lab's controls.
import { Button, UiProvider } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import "../dashboard/dashboard.css";
import { layoutFor } from "../dashboard/model.ts";
import { FormIcon } from "../forms/FormIcon.tsx";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import { useContentWidth } from "../guidance/useContentWidth.ts";
import { MotionScope } from "../reel/helpers/MotionScope.tsx";
import {
  LIVE_CANDIDATES,
  NOT_CHOSEN,
  SPACE_CANDIDATES,
  TEMP_CANDIDATES,
} from "./candidates.ts";
import "./charts.css";
import { DriveSheet } from "./DriveSheet.tsx";
import { seriesOf, STILL_COUNT, STILL_START, useReadings } from "./feed.ts";
import { InPlace } from "./InPlace.tsx";
import { SpanLine } from "./LiveCharts.tsx";
import type { Space } from "./model.ts";
import {
  clock,
  diskGroups,
  DISKS,
  DISKS_24,
  FILE_SYSTEMS,
  NBSP,
  SMART_SETTINGS,
  spaceOf,
  tempOf,
  VOLUMES,
  VOLUMES_24,
  withCopy,
} from "./model.ts";
import type { SpaceSize } from "./SpaceCharts.tsx";
import { OverWord } from "./SpaceCharts.tsx";
import type { ChartsDisks, ChartsView, ChartsWidth } from "./states.ts";
import { chartsQuery, readChartsView } from "./states.ts";

type Chart = (props: { space: Space; size: SpaceSize }) => ReactNode;

const MAP_IDS = ["data", "backup", "media"];

function SpaceSizes({ Chart, spaces }: { Chart: Chart; spaces: Space[] }) {
  const onMap = spaces.filter((s) => MAP_IDS.includes(s.id));
  const page = spaces.find((s) => s.id === "data");
  return (
    <div className="ch-sizes">
      <div>
        <h4 className="ch-size-title">In a row of the NAS map</h4>
        <ul className="ch-specimens">
          {onMap.map((s) => (
            <li key={s.id}>
              <span className="ch-specimen-name">
                <b>{s.name}</b>
                <span>{s.tech}</span>
              </span>
              <Chart space={s} size="map" />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="ch-size-title">In the file systems table</h4>
        <table className="ch-table">
          <thead>
            <tr>
              <th scope="col">File system</th>
              <th scope="col" className="ch-table-type">
                Type
              </th>
              <th scope="col">Space used</th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="ch-table-name">
                    <span className="ch-strong">{s.name}</span>
                    <OverWord over={s.over} />
                  </span>
                </td>
                <td className="ch-table-type ch-muted">{s.tech}</td>
                <td>
                  <Chart space={s} size="cell" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page ? (
        <div className="ch-size-page">
          <h4 className="ch-size-title">On the Data drive&apos;s own page</h4>
          <Chart space={page} size="page" />
        </div>
      ) : null}
    </div>
  );
}

export default function ChartsLab() {
  const initial = useMemo(() => readChartsView(window.location.search), []);
  return (
    <UiProvider>
      <ChartsScreen initial={initial} />
    </UiProvider>
  );
}

function ChartsScreen({ initial }: { initial: ChartsView }) {
  const [theme, setTheme] = useState(initial.theme);
  const [density, setDensity] = useState(initial.density);
  const [motion, setMotion] = useState(initial.motion);
  const [width, setWidth] = useState<ChartsWidth>(initial.width);
  const [copy, setCopy] = useState(initial.copy);
  const [chrome, setChrome] = useState(initial.chrome);
  const [diskSet, setDiskSet] = useState<ChartsDisks>(initial.disks);
  const [paused, setPaused] = useState(initial.still);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const { readings, take } = useReadings(initial.still, paused);
  const series = seriesOf(readings);
  const frameRef = useRef<HTMLDivElement>(null);
  const layout = layoutFor(useContentWidth(frameRef));

  // The disks were read once, when the page opened (still: at 10:31).
  const [readAt] = useState(() =>
    clock(initial.still ? STILL_START : Date.now()),
  );

  const spaces = (copy ? withCopy(FILE_SYSTEMS) : FILE_SYSTEMS).flatMap((f) => {
    const s = spaceOf(f);
    return s ? [s] : [];
  });
  const dataDrive = spaces.find((s) => s.id === "data");
  const disks = (diskSet === "24" ? DISKS_24 : DISKS).map((d) =>
    tempOf(d, SMART_SETTINGS),
  );
  const groups = diskGroups(disks, diskSet === "24" ? VOLUMES_24 : VOLUMES);

  useEffect(() => {
    const q = chartsQuery({
      theme,
      density,
      motion,
      width,
      still: initial.still,
      copy,
      chrome,
      disks: diskSet,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [theme, density, motion, width, copy, chrome, diskSet, initial.still]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    if (density === "compact") {
      root.dataset.density = "compact";
    } else {
      delete root.dataset.density;
    }
    root.dataset.motion = motion;
    document.title = "Lab: Charts";
  }, [theme, density, motion]);

  useEffect(() => {
    if (!note) {
      return;
    }
    const timer = window.setTimeout(() => {
      setNote(null);
    }, 3600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [note]);

  const onNote = (text: string) => {
    setNote({ id: Date.now(), text: `${text} (Not part of this prototype.)` });
  };

  return (
    <div className="omv-lab-dash omv-lab-charts" data-motion={motion}>
      <MotionScope reduced={motion === "reduced"}>
        <div ref={frameRef} className="ch-frame" data-width={width}>
          <header className="ch-head">
            <h1>Charts</h1>
            <p>
              The charts chosen for the space a file system uses, the live
              readouts and the disks&apos; temperatures, then all of them in
              place. Every figure comes from a read the contract names, and the
              live charts draw only the readings this page took.
            </p>
          </header>

          <section className="ch-subject" aria-labelledby="ch-space-title">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-space-title">Space used on a file system</h2>
                <p className="ch-intro">
                  From the file system list: its size, what is free, the share
                  used and the warning mark the admin set. tank has no mark,
                  Backup&apos;s mark is at 88{NBSP}%, so its gap steps inside a
                  column, and Media is past its mark.
                </p>
              </div>
              <div className="ch-tools">
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={() => {
                    setCopy((c) => !c);
                  }}
                >
                  {copy
                    ? "Delete the 1 TiB copy"
                    : "Copy 1 TiB to the Data drive"}
                </Button>
              </div>
            </div>
            {SPACE_CANDIDATES.map((c) => (
              <article
                key={c.id}
                className="ch-candidate"
                aria-labelledby={`ch-space-${c.id}`}
              >
                <div>
                  <h3 id={`ch-space-${c.id}`}>{c.title}</h3>
                  <p className="ch-caption">{c.caption}</p>
                </div>
                <div className="ch-body">
                  <SpaceSizes Chart={c.Chart} spaces={spaces} />
                </div>
              </article>
            ))}
          </section>

          <section className="ch-subject" aria-labelledby="ch-live-subject">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-live-subject">Live readouts</h2>
                <p className="ch-intro">
                  {initial.still
                    ? `A fixed set of ${String(STILL_COUNT)} readings from 10:31:04, two seconds apart, so every screenshot is the same. `
                    : "The page takes a reading every 2 seconds and keeps at most 2 minutes; it starts empty and is never filled in backwards. "}
                  In the lab the readings are simulated, with values like the
                  mock&apos;s: 3.8 GiB of memory and a 1 Gbit/s port.
                </p>
              </div>
              <div className="ch-tools" role="group" aria-label="Readings">
                <Button
                  variant="neutral"
                  size="sm"
                  aria-pressed={paused}
                  onClick={() => {
                    setPaused((p) => !p);
                  }}
                >
                  {paused ? "Play" : "Pause"}
                </Button>
                <Button variant="neutral" size="sm" onClick={take}>
                  Take a reading
                </Button>
              </div>
            </div>
            {LIVE_CANDIDATES.map((c) => (
              <article
                key={c.id}
                className="ch-candidate"
                data-wide=""
                aria-labelledby={`ch-live-${c.id}`}
              >
                <div>
                  <h3 id={`ch-live-${c.id}`}>{c.title}</h3>
                  <p className="ch-caption">{c.caption}</p>
                </div>
                <div className="ch-body">
                  <c.Strip s={series} />
                  <SpanLine s={series} paused={paused} />
                </div>
              </article>
            ))}
          </section>

          <section className="ch-subject" aria-labelledby="ch-temp-title">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-temp-title">Disk temperatures</h2>
                <p className="ch-intro">
                  From the disk list, read once at {readAt} when the page
                  opened; it never wakes a sleeping disk. The alert limit is the
                  one set in the disk health settings, 45{NBSP}°C here, and is
                  drawn only when one is set. A disk&apos;s kind comes from its
                  device name and its health information, and its group from the
                  RAID and ZFS lists.{" "}
                  {diskSet === "24"
                    ? "These are 24 disks in three arrays and a pool, and ten in none. The Archive array is shown rebuilding, on purpose, so its group says so."
                    : "These are the dashboard's six disks: sdb and sdc make the Backup mirror, and sdd the pool tank."}
                </p>
              </div>
              <div className="ch-tools" role="group" aria-label="Disks">
                <Button
                  variant="neutral"
                  size="sm"
                  aria-pressed={diskSet === "6"}
                  onClick={() => {
                    setDiskSet("6");
                  }}
                >
                  6 disks
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  aria-pressed={diskSet === "24"}
                  onClick={() => {
                    setDiskSet("24");
                  }}
                >
                  24 disks
                </Button>
              </div>
            </div>
            <article
              className="ch-candidate"
              aria-labelledby="ch-temp-pictures"
            >
              <div>
                <h3 id="ch-temp-pictures">Drive pictures</h3>
                <p className="ch-caption">
                  Each kind of disk drawn as what it is: a hard disk with its
                  platter and head arm, an SSD as a slab of chips with its
                  connector, and an NVMe SSD as a long stick with its contacts
                  at one end. Each size is drawn for itself, in the text and
                  divider inks, so the shape alone tells the kinds apart.
                </p>
              </div>
              <div className="ch-body">
                <DriveSheet />
              </div>
            </article>
            {TEMP_CANDIDATES.map((c) => (
              <article
                key={c.id}
                className="ch-candidate"
                aria-labelledby={`ch-temp-${c.id}`}
              >
                <div>
                  <h3 id={`ch-temp-${c.id}`}>{c.title}</h3>
                  <p className="ch-caption">{c.caption}</p>
                </div>
                <div className="ch-body">
                  <c.Chart groups={groups} readAt={readAt} place="page" />
                </div>
              </article>
            ))}
          </section>

          <section className="ch-subject" aria-labelledby="ch-inplace-title">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-inplace-title">In place</h2>
                <p className="ch-intro">
                  On the dashboard, the segment bar in a row of the NAS map, the
                  two live charts as the Right now strip, and the temperatures
                  by kind with each array and pool as a group. Past eight disks
                  the dashboard shows only the groups with a disk over the alert
                  limit and sums up the rest in a sentence, with a way to open
                  them; the Disks page shows every disk. Both at the size they
                  would have.
                </p>
              </div>
            </div>
            {dataDrive ? (
              <InPlace
                space={dataDrive}
                series={series}
                paused={paused}
                groups={groups}
                readAt={readAt}
                layout={layout}
                onNote={onNote}
              />
            ) : null}
          </section>

          <section className="ch-subject" aria-labelledby="ch-not-title">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-not-title">Not chosen</h2>
                <p className="ch-intro">
                  The candidates the owner did not pick, one line each.
                </p>
              </div>
            </div>
            <dl className="ch-not">
              {NOT_CHOSEN.map((n) => (
                <div key={n.title} className="ch-not-item">
                  <dt>
                    {n.title}
                    <span className="ch-not-subject">{n.subject}</span>
                  </dt>
                  <dd>{n.line}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </MotionScope>
      <p className="lf-note" role="status">
        {note ? <span key={note.id}>{note.text}</span> : null}
      </p>
      {chrome ? (
        <aside className="lx-labbar lf-labbar" aria-label="Design lab controls">
          <span className="lx-labbar-tag">Lab</span>
          <Toggle
            label="Width"
            value={width}
            options={[
              ["full", "Full"],
              ["900", "900"],
              ["390", "390"],
            ]}
            onChange={setWidth}
          />
          <Toggle
            label="Theme"
            value={theme}
            options={[
              ["dark", "Dark"],
              ["light", "Light"],
            ]}
            onChange={setTheme}
          />
          <Toggle
            label="Density"
            value={density}
            options={[
              ["comfortable", "Comfy"],
              ["compact", "Compact"],
            ]}
            onChange={setDensity}
          />
          <Toggle
            label="Animations"
            value={motion}
            options={[
              ["full", "Full"],
              ["reduced", "Reduced"],
            ]}
            onChange={setMotion}
          />
          <button
            type="button"
            className="lx-labbar-solo"
            aria-label="Hide the lab controls"
            onClick={() => {
              setChrome(false);
            }}
          >
            <FormIcon name="close" />
          </button>
        </aside>
      ) : null}
    </div>
  );
}
