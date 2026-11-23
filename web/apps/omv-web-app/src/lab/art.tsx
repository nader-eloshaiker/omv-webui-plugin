// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's illustrations and diagrams: development only (UI-11). One drawing language: a 4px grid,
// 1.5px strokes that do not scale, corner radius 3 or 6, ink from currentColor and fills from the
// stylesheet's --art-* properties, so both themes and every direction re-colour them without a
// second drawing. Each is a React component built from data; nothing parses or injects SVG text
// (UI-2), and nothing is fetched (UI-7). Words a reader needs are HTML beside the drawing, so they
// reflow at 390px and zoom with the page; the drawing itself is either decorative (aria-hidden,
// with the words next to it) or a role="img" with a full text alternative.
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import type { Disk } from "./data.ts";
import { STATUS_WORD } from "./data.ts";
import { Mark } from "./ui.tsx";
import { cx, vars } from "./util.ts";

/** One drive caddy, front view: vents, a handle, the activity window and the health light. */
function Caddy({
  status,
  kind,
}: {
  status: Disk["status"];
  kind: Disk["kind"];
}) {
  return (
    <svg
      className={`lx-caddy lx-caddy--${status}`}
      viewBox="0 0 56 120"
      aria-hidden="true"
    >
      <rect
        className="lx-caddy-body"
        x="2"
        y="2"
        width="52"
        height="116"
        rx="6"
      />
      {kind === "usb" ? (
        <>
          <rect
            className="lx-caddy-port"
            x="16"
            y="44"
            width="24"
            height="12"
            rx="2"
          />
          <path className="lx-caddy-line" d="M28 56v22" />
          <rect
            className="lx-caddy-face"
            x="14"
            y="78"
            width="28"
            height="18"
            rx="3"
          />
        </>
      ) : (
        <>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path
              key={i}
              className="lx-caddy-vent"
              d={`M14 ${28 + i * 8}h28`}
            />
          ))}
          <rect
            className="lx-caddy-handle"
            x="10"
            y="90"
            width="36"
            height="18"
            rx="4"
          />
          {kind === "ssd" ? (
            <path className="lx-caddy-line" d="M18 99h20" />
          ) : null}
        </>
      )}
      <circle className="lx-caddy-led" cx="28" cy="14" r="4" />
    </svg>
  );
}

/**
 * The NAS front panel: one slot per disk, each with its health light and, under it, the device,
 * its health word and what it holds. The slot light is coloured by state and shaped by the mark
 * beside the words, so no slot depends on colour.
 */
export function DriveBay({
  disks,
  focus,
  compact,
}: {
  disks: Disk[];
  focus?: string | null;
  compact?: boolean;
}) {
  return (
    <figure className={cx("lx-baypic", compact && "lx-baypic--compact")}>
      <div className="lx-chassis">
        <div className="lx-chassis-top" aria-hidden="true">
          <span className="lx-chassis-power" />
          <span className="lx-chassis-name">nas</span>
        </div>
        <ol className="lx-slots">
          {disks.map((d, i) => (
            <li
              key={d.id}
              className={cx(
                "lx-slot",
                `is-${d.status}`,
                focus === d.id && "is-arrived",
              )}
              style={vars({ "--i": i })}
            >
              <Caddy status={d.status} kind={d.kind} />
              <span className="lx-slot-dev lx-mono">{d.device}</span>
              <span className="lx-slot-state">
                <Mark status={d.status} size={12} /> {STATUS_WORD[d.status]}
              </span>
              {!compact ? <span className="lx-slot-role">{d.role}</span> : null}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="lx-vh">
        {disks
          .map((d) => `${d.device}: ${STATUS_WORD[d.status]}, holds ${d.role}`)
          .join("; ")}
      </figcaption>
    </figure>
  );
}

type Layout = "mirror" | "stripe" | "parity";

const LAYOUTS: Record<
  Layout,
  {
    title: string;
    disks: number;
    rows: string[][];
    usable: string;
    survives: string;
    lost: string;
  }
> = {
  mirror: {
    title: "Mirror",
    disks: 2,
    rows: [
      ["A", "A"],
      ["B", "B"],
      ["C", "C"],
    ],
    usable: "Half the space: 3.6\u00a0TiB from two 3.6\u00a0TiB disks",
    survives: "Keeps working when one disk fails",
    lost: "Nothing is lost: the other disk has every block.",
  },
  stripe: {
    title: "Stripe",
    disks: 2,
    rows: [
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ],
    usable: "All the space: 7.2\u00a0TiB from two 3.6\u00a0TiB disks",
    survives: "Any disk failing loses everything",
    lost: "Half of every file was on the failed disk: all of it is lost.",
  },
  parity: {
    title: "Parity (RAID 5, RAID-Z1)",
    disks: 3,
    rows: [
      ["A", "B", "P"],
      ["C", "P", "D"],
      ["P", "E", "F"],
    ],
    usable: "Two thirds: 7.2\u00a0TiB from three 3.6\u00a0TiB disks",
    survives: "Keeps working when one disk fails",
    lost: "Nothing is lost: the missing blocks are rebuilt from parity (P).",
  },
};

/**
 * How disks combine, drawn as blocks on disks, with a preview of one disk failing before anyone
 * commits to a layout. The current layout of pool is marked; the others are for comparison.
 */
export function Arrangement({ current = "mirror" }: { current?: Layout }) {
  const [failing, setFailing] = useState(false);
  return (
    <div className="lx-arr">
      <div className="lx-arr-head">
        <p className="lx-arr-q">What happens if a disk fails?</p>
        <button
          type="button"
          className={cx("lx-btn lx-btn--secondary", failing && "is-on")}
          aria-pressed={failing}
          onClick={() => {
            setFailing(!failing);
          }}
        >
          {failing ? "Bring the disk back" : "Show a disk failing"}
        </button>
      </div>
      <ul className="lx-arr-list">
        {(Object.keys(LAYOUTS) as Layout[]).map((key) => {
          const l = LAYOUTS[key];
          const w = l.disks * 44 + (l.disks - 1) * 12;
          const lostAll = failing && key === "stripe";
          return (
            <li
              key={key}
              className={cx(
                "lx-arr-item",
                key === current && "is-current",
                failing && "is-failing",
                lostAll && "is-lost",
              )}
            >
              <svg
                className="lx-arr-pic"
                width={w}
                height={124}
                viewBox={`0 0 ${w} 124`}
                aria-hidden="true"
              >
                {Array.from({ length: l.disks }, (_, d) => {
                  const x = d * 56;
                  const dead = failing && d === 0;
                  return (
                    <g key={d} className={cx("lx-arr-disk", dead && "is-dead")}>
                      <rect
                        className="lx-arr-case"
                        x={x + 1}
                        y="1"
                        width="42"
                        height="122"
                        rx="6"
                      />
                      {l.rows.map((row, r) => {
                        const label = row[d] ?? "";
                        return (
                          <g
                            key={r}
                            className={cx(
                              "lx-arr-block",
                              label === "P" && "is-parity",
                            )}
                            style={vars({ "--i": r + d })}
                          >
                            <rect
                              x={x + 7}
                              y={10 + r * 30}
                              width="30"
                              height="22"
                              rx="3"
                            />
                            <text
                              x={x + 22}
                              y={25 + r * 30}
                              textAnchor="middle"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}
                      {dead ? (
                        <path
                          className="lx-arr-x"
                          d={`M${x + 6} 6 L${x + 38} 118 M${x + 38} 6 L${x + 6} 118`}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </svg>
              <div className="lx-arr-text">
                <p className="lx-arr-title">
                  {l.title}
                  {key === current ? (
                    <span className="lx-tag">pool uses this</span>
                  ) : null}
                </p>
                <p>{l.usable}</p>
                <p
                  className={cx(
                    "lx-arr-survive",
                    key === "stripe" && "is-risk",
                  )}
                >
                  {key === "stripe" ? (
                    <ShieldOff size={14} aria-hidden />
                  ) : (
                    <ShieldCheck size={14} aria-hidden />
                  )}
                  {l.survives}
                </p>
                <p className="lx-arr-lost" aria-live="polite">
                  {failing ? l.lost : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A copy job's direction: from, to, and a dash that travels the way the files go. */
export function CopyDirection({
  from,
  to,
  when,
}: {
  from: string;
  to: string;
  when: string;
}) {
  return (
    <p className="lx-copydir">
      <span className="lx-chip">{from}</span>
      <svg
        className="lx-copydir-arrow"
        width="64"
        height="16"
        viewBox="0 0 64 16"
        aria-hidden="true"
      >
        <path className="lx-copydir-track" d="M2 8h56" />
        <path className="lx-copydir-flow" d="M2 8h56" />
        <path className="lx-copydir-head" d="M52 3l7 5-7 5" />
      </svg>
      <span className="lx-chip">{to}</span>
      <span className="lx-copydir-when">{when}</span>
    </p>
  );
}

/** What a delete takes away: the folder, its files, and the two things that point at it. */
export function DeletePicture() {
  return (
    <svg
      className="lx-delpic"
      viewBox="0 0 280 92"
      role="img"
      aria-label="Photos and its files are deleted; the Windows share and the copy job that use it stop working."
    >
      <g className="lx-delpic-gone">
        <path d="M14 22h26l6 6h34a4 4 0 014 4v42a4 4 0 01-4 4H14a4 4 0 01-4-4V26a4 4 0 014-4z" />
        <path className="lx-delpic-file" d="M26 40h24M26 50h36M26 60h18" />
        <path className="lx-delpic-x" d="M30 30l36 40M66 30L30 70" />
      </g>
      <g className="lx-delpic-cut">
        <path d="M86 40 C120 40 128 22 160 22" />
        <path d="M86 60 C120 60 128 72 160 72" />
        <path
          className="lx-delpic-break"
          d="M118 26l8 8M126 26l-8 8M118 62l8 8M126 62l-8 8"
        />
      </g>
      <g className="lx-delpic-dep">
        <rect x="162" y="10" width="110" height="24" rx="6" />
        <text x="217" y="26" textAnchor="middle">
          Windows share
        </text>
        <rect x="162" y="60" width="110" height="24" rx="6" />
        <text x="217" y="76" textAnchor="middle">
          Copy job
        </text>
      </g>
    </svg>
  );
}

/** Empty states teach the next step: here, where saved changes wait. */
export function EmptyPending() {
  return (
    <div className="lx-emptyart">
      <svg
        viewBox="0 0 120 64"
        width="120"
        height="64"
        aria-hidden="true"
        className="lx-emptyart-pic"
      >
        <rect
          className="lx-emptyart-form"
          x="6"
          y="10"
          width="44"
          height="44"
          rx="6"
        />
        <path className="lx-emptyart-line" d="M14 24h26M14 32h20M14 40h24" />
        <path className="lx-emptyart-arrow" d="M56 32h18M68 26l6 6-6 6" />
        <rect
          className="lx-emptyart-bar"
          x="80"
          y="22"
          width="34"
          height="20"
          rx="5"
        />
        <path className="lx-emptyart-line" d="M86 32h14" />
      </svg>
      <p>
        Nothing is waiting. When you save a setting, it waits here until you
        apply it, so you can change several things and apply them together.
      </p>
    </div>
  );
}
