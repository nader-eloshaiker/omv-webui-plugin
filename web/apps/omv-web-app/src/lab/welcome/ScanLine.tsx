// SPDX-License-Identifier: GPL-3.0-or-later
// The NAS at a glance: one status per area (disks, storage, sharing, network), each its status icon
// and coloured word with a short count from the reads, under the answer. Labelled values in a row, in
// sentence case, never pills; each value is a link to its part of the page, which takes the jump
// highlight once when it lands. Development only (UI-11).
//
// It stands on its own strip because it is read as one line: the whole NAS in four readings, the
// way an instrument's status row is read before its dials.
import { StatusLabel } from "@omv-webui/react-ui-components";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LabNas } from "./model.ts";
import type { CheckState } from "./states.ts";
import { figure, fill, SCAN } from "./words.ts";

type Area = "disks" | "storage" | "sharing" | "network";
type Tone = "ok" | "warning" | "critical" | "unknown";

/** Where each area's link lands. */
const TARGETS: Record<Area, string> = {
  disks: "wl-temps",
  storage: "wl-map",
  sharing: "wl-map",
  network: "wl-map",
};

/** Scroll to the part and ring it once (the jump highlight), as a link inside the page does. */
function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  event.preventDefault();
  target.scrollIntoView({ block: "start" });
  target.classList.remove("animate-arrive");
  // A new frame, so the highlight plays again on a second press.
  requestAnimationFrame(() => {
    target.classList.add("animate-arrive");
  });
  target.focus({ preventScroll: true });
}

export function ScanLine({ nas, check }: { nas: LabNas; check: CheckState }) {
  const { t } = useTranslation();
  const f = nas.facts;
  const checked = check === "after";
  const full = nas.storage.find((s) => s.health !== "ok");
  const ways = nas.input.ways.filter((w) => w.running && w.id !== "ssh");
  const net = nas.input.interfaces[0];

  const cells: {
    area: Area;
    tone: Tone;
    word: string;
    count: string;
  }[] = [
    {
      area: "disks",
      tone: checked ? "ok" : "unknown",
      word: checked ? t("health.ok") : SCAN.notChecked,
      count:
        f.asleep.length > 0
          ? fill(SCAN.disksCount, {
              count: figure(f.disks, "disk", "disks"),
              asleep: String(f.asleep.length),
            })
          : figure(f.disks, "disk", "disks"),
    },
    {
      area: "storage",
      tone: full ? "warning" : "ok",
      word: full ? full.healthLabel : t("health.ok"),
      count: full
        ? fill(SCAN.drivesSome, {
            name: full.name,
            percent: t("dashboard.now.percent", { value: full.percent }),
          })
        : f.drives <= 1
          ? SCAN.drivesNone
          : fill(SCAN.drivesAll, {
              count: figure(f.drives, "drive", "drives"),
            }),
    },
    {
      area: "sharing",
      tone: f.folders === 0 ? "unknown" : "ok",
      word: f.folders === 0 ? SCAN.notSetUp : t("health.ok"),
      count:
        f.folders === 0
          ? SCAN.sharingNone
          : fill(SCAN.sharingOn, {
              folders: figure(f.folders, "folder", "folders"),
              ways: figure(ways.length, "way in", "ways in"),
            }),
    },
    {
      area: "network",
      tone: net?.up === true ? "ok" : "unknown",
      word: net?.up === true ? t("health.ok") : t("dashboard.map.notConnected"),
      count: net
        ? fill(SCAN.networkUp, { name: net.name, speed: net.speed ?? "" })
        : "",
    },
  ];

  return (
    <nav className="wl-scan" aria-label={SCAN.label}>
      <ul>
        {cells.map((c) => (
          <li key={c.area} data-tone={c.tone}>
            <a
              href={`#${TARGETS[c.area]}`}
              onClick={(event) => {
                jump(event, TARGETS[c.area]);
              }}
            >
              <span className="wl-scan-label">{SCAN[c.area]}</span>
              <span className="wl-scan-value">
                <StatusLabel status={c.tone}>{c.word}</StatusLabel>
                <span className="wl-scan-count">{c.count}</span>
              </span>
              <span className="sr-only">
                {fill(SCAN.goTo, { part: SCAN.parts[c.area] })}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
