// SPDX-License-Identifier: GPL-3.0-or-later
// The chart prototype, in the lab: development only (UI-11). Round two (owner, 2026-11-26): the
// waffle for space, "Two charts, four series" for the live readouts, and two ways to draw the
// temperatures (along one scale, stacked; in bay order, as caddies). Each subject shows its chart
// with one sentence on what it shows and why, the page ends with them in place at the size they would have, and
// the round-one candidates the owner did not pick are listed under "Not chosen", one line each.
//
// The query string selects what is shown and never acts (UI-4): screen=charts, theme=dark|light,
// density=comfortable|compact, width=full|900|390 (frames the page), motion=full|reduced, still=1 (a
// fixed set of 40 readings, paused, for screenshots), copy=1 (the Data drive read after a 1 TiB
// copy), disks=24 (the 24-disk bay), empty=edge (the waffle's empty squares in the outline colour),
// chrome=0 hides the lab's controls.
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
import { seriesOf, STILL_COUNT, STILL_START, useReadings } from "./feed.ts";
import { InPlace } from "./InPlace.tsx";
import { SpanLine } from "./LiveCharts.tsx";
import type { Space } from "./model.ts";
import {
  clock,
  DISKS,
  DISKS_24,
  FILE_SYSTEMS,
  NBSP,
  SMART_SETTINGS,
  spaceOf,
  tempOf,
  withCopy,
} from "./model.ts";
import type { SpaceSize } from "./SpaceCharts.tsx";
import { OverWord } from "./SpaceCharts.tsx";
import type {
  ChartsDisks,
  ChartsEmpty,
  ChartsView,
  ChartsWidth,
} from "./states.ts";
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
  const [empty, setEmpty] = useState<ChartsEmpty>(initial.empty);
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
      empty,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [
    theme,
    density,
    motion,
    width,
    copy,
    chrome,
    diskSet,
    empty,
    initial.still,
  ]);

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
        <div
          ref={frameRef}
          className="ch-frame"
          data-width={width}
          data-empty={empty}
        >
          <header className="ch-head">
            <h1>Charts</h1>
            <p>
              The charts chosen for the space a file system uses and the live
              readouts, two ways to draw the disks&apos; temperatures, then all
              of them in place. Every figure comes from a read the contract
              names, and the live charts draw only the readings this page took.
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
                <h2 id="ch-temp-title">Disk temperatures across the bay</h2>
                <p className="ch-intro">
                  From the disk list, read once at {readAt} when the page
                  opened; it never wakes a sleeping disk. The alert limit is the
                  one set in the disk health settings, 45{NBSP}°C here, and is
                  drawn only when one is set.{" "}
                  {diskSet === "24"
                    ? "This is a bay of 24 disks: five share 35\u00a0°C, four 36\u00a0°C, and three each 34\u00a0°C and 37\u00a0°C."
                    : "This is the dashboard's bay of six disks."}
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
                  <c.Chart disks={disks} readAt={readAt} />
                </div>
              </article>
            ))}
          </section>

          <section className="ch-subject" aria-labelledby="ch-inplace-title">
            <div className="ch-subject-head">
              <div>
                <h2 id="ch-inplace-title">In place</h2>
                <p className="ch-intro">
                  On the dashboard, the waffle in a row of the NAS map, the two
                  live charts as the Right now strip, and the temperatures
                  stacked along one scale, where the spread across the bay
                  matters. On the Disks page, the temperatures in bay order,
                  where finding the hot disk in the case matters. Both at the
                  size they would have.
                </p>
              </div>
            </div>
            {dataDrive ? (
              <InPlace
                space={dataDrive}
                series={series}
                paused={paused}
                disks={disks}
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
                  The round-one candidates the owner did not pick, one line
                  each.
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
            label="Empty squares"
            value={empty}
            options={[
              ["divider", "Divider"],
              ["edge", "Edge"],
              ["slate", "Slate"],
            ]}
            onChange={setEmpty}
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
