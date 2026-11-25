// SPDX-License-Identifier: GPL-3.0-or-later
// The Disks lane's bay (rethink spec 6.2 C, 6.4): slot tiles with their health in place, and beyond
// twelve disks a strip of ticks for the healthy ones while every disk in trouble keeps its full
// slot. Lab-local until the owner has seen it, a candidate for DriveBay's "slot tiles" mode and
// *BayStrip (spec 8 row 1). Development only (UI-11). A slot whose disk goes to sleep turns its
// platter arc a quarter and stops, and a moon fades in beside "Asleep" (7.6); only on a change,
// never on page load.
import { StatusIcon } from "@omv-webui/react-ui-components";
import { useState } from "react";
import type { MapDisk } from "./model.ts";
import { celsius, stripWords } from "./model.ts";

const KIND_WORD: Record<MapDisk["kind"], string> = {
  hdd: "Hard disk",
  ssd: "SSD",
  nvme: "NVMe SSD",
  usb: "USB disk",
};

/** The caddy's face by kind, front view, with the health light. Decorative: the words say it all. */
function Caddy({ disk }: { disk: MapDisk }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 44"
      className="dm-caddy"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="41"
        rx="4"
        className="dm-caddy-body"
      />
      <circle cx="16" cy="7" r="2.4" className="dm-caddy-led" />
      {disk.kind === "hdd" ? (
        <g className="dm-platter">
          <circle cx="16" cy="25" r="9" className="dm-caddy-part" />
          <circle cx="16" cy="25" r="2" className="dm-caddy-part" />
          {/* The platter arc: turns a quarter and stops when the disk goes to sleep. */}
          <path d="M16 18a7 7 0 0 1 7 7" className="dm-arc" />
        </g>
      ) : disk.kind === "nvme" ? (
        <g>
          <rect
            x="9"
            y="14"
            width="14"
            height="24"
            rx="1.5"
            className="dm-caddy-part"
          />
          <path d="M12 18h8M12 22h8M12 26h8" className="dm-caddy-faint" />
          <circle cx="16" cy="34" r="1.2" className="dm-caddy-part" />
        </g>
      ) : (
        <g>
          <rect
            x="8"
            y="15"
            width="16"
            height="20"
            rx="2"
            className="dm-caddy-part"
          />
          <path d="M11 20h10M11 24h10M11 28h6" className="dm-caddy-faint" />
        </g>
      )}
    </svg>
  );
}

function slotName(disk: MapDisk): string {
  const detail =
    disk.power === "asleep"
      ? "asleep"
      : disk.temp === null
        ? ""
        : `${String(disk.temp)} °C`;
  return [
    disk.device,
    `${KIND_WORD[disk.kind]} ${disk.size}`,
    disk.word,
    detail,
  ]
    .filter(Boolean)
    .join(", ");
}

/** One disk as a tile: its caddy, its device in mono, and its state in words (never colour alone). */
export function SlotTile({
  disk,
  risk,
  trace,
  tabbable,
  onTrace,
  onOpen,
  register,
}: {
  disk: MapDisk;
  risk?: "warning" | "critical";
  trace?: "lit" | "dim";
  tabbable: boolean;
  onTrace: (id: string | null) => void;
  onOpen: (words: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  // Whether the power state changed since the slot was first drawn: only a change is news (7.6).
  const [initialPower] = useState(disk.power);
  const powerChanged = disk.power !== initialPower;
  const quiet = disk.health === "ok";
  return (
    <button
      ref={(el) => {
        register(disk.id, el);
      }}
      type="button"
      className="dm-slot"
      data-node={disk.id}
      data-health={disk.health}
      data-risk={risk}
      data-trace={trace}
      data-power={disk.power}
      data-power-changed={powerChanged || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={slotName(disk)}
      onPointerEnter={() => {
        onTrace(disk.id);
      }}
      onPointerLeave={() => {
        onTrace(null);
      }}
      onFocus={() => {
        onTrace(disk.id);
      }}
      onBlur={() => {
        onTrace(null);
      }}
      onClick={() => {
        onOpen(`Opens disk ${disk.device}.`);
      }}
    >
      <Caddy disk={disk} />
      <span className="dm-slot-device">{disk.device}</span>
      <span
        key={disk.health}
        className="dm-slot-state"
        data-health={disk.health}
      >
        {quiet ? null : <StatusIcon status={disk.health} />}
        {quiet ? (
          disk.power === "asleep" ? (
            <>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="dm-moon">
                <path d="M8.6 7.8A4 4 0 0 1 4.2 3.4 4 4 0 1 0 8.6 7.8Z" />
              </svg>
              Asleep
            </>
          ) : disk.temp === null ? (
            disk.word
          ) : (
            celsius(disk.temp)
          )
        ) : (
          disk.word
        )}
      </span>
    </button>
  );
}

/** The healthy disks beyond twelve, as ticks with their shape, and their count in words (6.4). */
export function BayStrip({
  disks,
  hasFull,
  trace,
  tabbable,
  onTrace,
  onOpen,
  register,
}: {
  disks: readonly MapDisk[];
  hasFull: boolean;
  trace?: "lit" | "dim";
  tabbable: boolean;
  onTrace: (id: string | null) => void;
  onOpen: (words: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const words = stripWords(disks, hasFull);
  return (
    <button
      ref={(el) => {
        register("strip:disks", el);
      }}
      type="button"
      className="dm-strip"
      data-node="strip:disks"
      data-trace={trace}
      tabIndex={tabbable ? 0 : -1}
      onPointerEnter={() => {
        onTrace("strip:disks");
      }}
      onPointerLeave={() => {
        onTrace(null);
      }}
      onFocus={() => {
        onTrace("strip:disks");
      }}
      onBlur={() => {
        onTrace(null);
      }}
      onClick={() => {
        onOpen("Opens the disks page.");
      }}
    >
      <span className="dm-ticks" aria-hidden="true">
        {disks.map((d) => (
          <span
            key={d.id}
            className="dm-tick"
            data-health={d.health}
            data-kind={d.kind}
          />
        ))}
      </span>
      <span className="dm-strip-words">
        {words.endsWith("all OK") ? <StatusIcon status="ok" /> : null}
        {words}
      </span>
    </button>
  );
}
