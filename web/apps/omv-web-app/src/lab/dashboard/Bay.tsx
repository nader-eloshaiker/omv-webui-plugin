// SPDX-License-Identifier: GPL-3.0-or-later
// A map row's disks (rethink spec 6.8): slot tiles with their health in place, and beyond six disks
// a strip of ticks for the healthy ones while every disk in trouble keeps its full slot. Lab-local
// until the owner has seen it, a candidate for DriveBay's "slot tiles" mode and
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

/** The disk drawn by kind, front view, with no light: its state is in words beside it. Decorative. */
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

/**
 * What a thing on the map takes from the map: its key, whether it is lit or dimmed by a trace, its
 * tab stop (one per map, moved by the arrow keys) and the pointer and focus that trace it.
 */
export interface ItemProps {
  ref: (el: HTMLElement | null) => void;
  "data-key": string;
  "data-trace": "lit" | "dim" | undefined;
  tabIndex: number;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

function slotName(disk: MapDisk, alsoIn: readonly string[]): string {
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
    alsoIn.length > 0 ? `also in ${alsoIn.join(" and ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * One disk as a slot: its caddy, its device in mono, and its state in words (never colour alone).
 * When its row says the state once for several disks (`said`), the slot shows what a healthy one
 * shows, its temperature or "Asleep", and its name still carries the state. A disk that is also
 * part of another storage (a partition in each) carries a small link mark and says so in its
 * tooltip and name (6.8 item 10).
 */
export function SlotTile({
  disk,
  alsoIn,
  said = false,
  item,
  onOpen,
}: {
  disk: MapDisk;
  alsoIn: readonly string[];
  said?: boolean;
  item: ItemProps;
  onOpen: (words: string) => void;
}) {
  // Whether the power state changed since the slot was first drawn: only a change is news (7.6).
  const [initialPower] = useState(disk.power);
  const powerChanged = disk.power !== initialPower;
  const healthy = disk.health === "ok";
  // The slot says its own state only when it is not healthy and its row does not say it.
  const own = !healthy && !said;
  return (
    <button
      {...item}
      type="button"
      className="dm-slot"
      data-health={disk.health}
      data-power={disk.power}
      data-power-changed={powerChanged || undefined}
      aria-label={slotName(disk, alsoIn)}
      title={alsoIn.length > 0 ? `Also in ${alsoIn.join(" and ")}` : undefined}
      onClick={() => {
        onOpen(`Opens disk ${disk.device}.`);
      }}
    >
      <Caddy disk={disk} />
      <span className="dm-slot-device">
        {disk.device}
        {alsoIn.length > 0 ? (
          <svg aria-hidden="true" viewBox="0 0 12 12" className="dm-slot-link">
            <path d="M5 7l2-2M4.2 5.6 3 6.8a1.7 1.7 0 0 0 2.4 2.4l1.2-1.2M7.8 6.4 9 5.2a1.7 1.7 0 0 0-2.4-2.4L5.4 4" />
          </svg>
        ) : null}
      </span>
      <span
        key={`${disk.health}:${String(own)}`}
        className="dm-slot-state"
        data-health={own ? disk.health : undefined}
      >
        {own ? <StatusIcon status={disk.health} /> : null}
        {own ? (
          disk.word
        ) : disk.power === "asleep" ? (
          <>
            <svg aria-hidden="true" viewBox="0 0 12 12" className="dm-moon">
              <path d="M8.6 7.8A4 4 0 0 1 4.2 3.4 4 4 0 1 0 8.6 7.8Z" />
            </svg>
            Asleep
          </>
        ) : disk.temp !== null ? (
          celsius(disk.temp)
        ) : healthy ? (
          disk.word
        ) : null}
      </span>
    </button>
  );
}

/** The healthy disks of a row beyond six, as 12px ticks with their shape, and their count (6.8 item 9). */
export function BayStrip({
  disks,
  hasFull,
  item,
  onOpen,
}: {
  disks: readonly MapDisk[];
  hasFull: boolean;
  item: ItemProps;
  onOpen: (words: string) => void;
}) {
  const words = stripWords(disks, hasFull);
  return (
    <button
      {...item}
      type="button"
      className="dm-strip"
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
      <span className="dm-strip-words">{words}</span>
    </button>
  );
}
