// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's tables (rethink 7.5): a row moving to its place, a new row arriving, a row leaving,
// sorting, expanding a row, the selection bar, quick actions, copy and usage bars. The disks and
// folders are the lab's fixtures (DiskMgmt.getList sizes and temperatures, ShareMgmt.getList names,
// FileSystemMgmt.getList usage). Development only (UI-11).
import {
  Button,
  Checkbox,
  Crossfade,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  LeavingItem,
  StatusLabel,
  useFlip,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import { ArrowUp, Ellipsis } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useFirstTime } from "../../../hooks/useFirstTime.ts";
import { useReducedMotion } from "../../../hooks/useMotionPreference.ts";
import { RollingNumber } from "../parts.tsx";
import type { StageProps } from "../types.ts";
import { CopyGlyphButton } from "./forms.tsx";

type Health = "ok" | "warning";

interface Disk {
  device: string;
  kind: string;
  /** In GiB, for sorting; shown as the lab's fixtures show it. */
  gib: number;
  size: string;
  temp: number;
  group: "System" | "In use" | "Not in use";
}

const DISKS: readonly Disk[] = [
  {
    device: "nvme0n1",
    kind: "NVMe SSD",
    gib: 238.5,
    size: "238.5 GiB",
    temp: 34,
    group: "System",
  },
  {
    device: "sda",
    kind: "Hard disk",
    gib: 3686.4,
    size: "3.6 TiB",
    temp: 36,
    group: "In use",
  },
  {
    device: "sdb",
    kind: "Hard disk",
    gib: 3686.4,
    size: "3.6 TiB",
    temp: 35,
    group: "In use",
  },
  {
    device: "sdc",
    kind: "Hard disk",
    gib: 3686.4,
    size: "3.6 TiB",
    temp: 37,
    group: "In use",
  },
  {
    device: "sdd",
    kind: "Hard disk",
    gib: 3686.4,
    size: "3.6 TiB",
    temp: 33,
    group: "In use",
  },
  {
    device: "sde",
    kind: "SSD",
    gib: 931.5,
    size: "931.5 GiB",
    temp: 31,
    group: "Not in use",
  },
];
const GROUPS = ["System", "In use", "Not in use"] as const;

// ─── A row moves to its group ─────────────────────────────────────────────────────────────────

type Line =
  | { type: "group"; id: string; name: string }
  | { type: "disk"; id: string; disk: Disk; health: Health };

/** Status first inside each group (4.4): a disk with a problem leads its group. */
function diskLines(warn: string | null): Line[] {
  return GROUPS.flatMap((group) => {
    const disks = DISKS.filter((d) => d.group === group)
      .map((disk) => ({
        disk,
        health: (disk.device === warn ? "warning" : "ok") as Health,
      }))
      .sort(
        (a, b) =>
          Number(b.health === "warning") - Number(a.health === "warning") ||
          a.disk.device.localeCompare(b.disk.device),
      );
    return [
      { type: "group" as const, id: `g:${group}`, name: group },
      ...disks.map((d) => ({ type: "disk" as const, id: d.disk.device, ...d })),
    ];
  });
}

const lineKey = (line: Line) => line.id;

export function MovesStage({ state }: StageProps<{ warn: boolean }>) {
  const warn = state.warn ? "sdd" : null;
  const [initialWarn] = useState(warn);
  const flip = useFlip(diskLines(warn), lineKey, {
    duration: "--duration-slow",
    curve: "--ease-soft",
  });
  return (
    <div className="rl-tablewrap" {...flip.containerProps}>
      <p className="rl-waiting" role="status">
        {flip.waiting ? (
          <Button variant="ghost" size="sm" onClick={flip.release}>
            1 row changed. Show it
          </Button>
        ) : null}
      </p>
      <table className="rl-table">
        <thead>
          <tr>
            <th scope="col">Disk</th>
            <th scope="col">Status</th>
            <th scope="col" className="rl-num">
              Temperature
            </th>
          </tr>
        </thead>
        <tbody>
          {flip.items.map((line) =>
            line.type === "group" ? (
              <tr key={line.id} data-flip-id={line.id} className="rl-group-row">
                <th scope="colgroup" colSpan={3}>
                  {line.name}
                </th>
              </tr>
            ) : (
              <tr
                key={line.id}
                data-flip-id={line.id}
                className="rl-trow"
                data-washed={
                  line.health === "warning" &&
                  warn !== initialWarn &&
                  !flip.waiting
                    ? ""
                    : undefined
                }
              >
                <td>
                  <span className="rl-strong rl-mono">{line.disk.device}</span>{" "}
                  <span className="rl-muted">
                    {line.disk.kind} {line.disk.size}
                  </span>
                </td>
                <td>
                  <Crossfade contentKey={line.health}>
                    {line.health === "warning" ? (
                      <StatusLabel status="warning">
                        Reports a problem
                      </StatusLabel>
                    ) : (
                      <span className="rl-muted">OK</span>
                    )}
                  </Crossfade>
                </td>
                <td className="rl-num">{line.disk.temp} °C</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── A new row arrives ────────────────────────────────────────────────────────────────────────

const FOLDER_NAMES = ["a4share", "Documents", "Music", "Time Machine"];

export function ArrivesStage({ state }: StageProps<{ photos: boolean }>) {
  const reduced = useReducedMotion();
  const names = [...FOLDER_NAMES, ...(state.photos ? ["Photos"] : [])].sort(
    (a, b) => a.localeCompare(b),
  );
  const flip = useFlip(names, (n) => n, { hold: false });
  const [initial] = useState(() => new Set(names));
  return (
    <ul className="rl-rows" ref={flip.containerProps.ref}>
      {flip.items.map((name) => (
        <li
          key={name}
          data-flip-id={name}
          className={
            initial.has(name)
              ? "rl-listrow"
              : reduced
                ? "rl-listrow rl-arrive-still"
                : "rl-listrow rl-arrive"
          }
        >
          <span className="rl-strong">{name}</span>
          <span className="rl-muted">
            {name === "Time Machine" || name === "a4share"
              ? "Backup"
              : "Data drive"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── A row leaves ─────────────────────────────────────────────────────────────────────────────

// Stable lists: the leaving list reads a new array as a change.
const FOLDERS_BEFORE = ["Photos", "Music", "Documents"] as const;
const FOLDERS_AFTER = ["Photos", "Music"] as const;

export function LeavesStage({ state }: StageProps<{ deleted: boolean }>) {
  const folders = state.deleted ? FOLDERS_AFTER : FOLDERS_BEFORE;
  const { entries, left } = useLeavingItems(folders, (n) => n);
  return (
    <div className="rl-group">
      <p className="rl-group-title">
        Data drive: <RollingNumber value={folders.length} /> shared folders
      </p>
      <ul className="rl-rows">
        {entries.map(({ key, leaving }) => (
          <LeavingItem
            key={key}
            leaving={leaving}
            onLeft={() => {
              left(key);
            }}
          >
            <div className="rl-listrow">
              <span className="rl-strong">{key}</span>
              <span className="rl-muted">Windows and Mac</span>
            </div>
          </LeavingItem>
        ))}
      </ul>
    </div>
  );
}

// ─── Sort ─────────────────────────────────────────────────────────────────────────────────────

export type SortKey = "device" | "size";

function SortHeader({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: "ascending" | "descending";
  onSort: () => void;
}) {
  return (
    <th scope="col" aria-sort={active ? dir : undefined}>
      <button
        type="button"
        className="rl-sort"
        data-active={active || undefined}
        data-dir={dir}
        onClick={onSort}
      >
        {label}
        <ArrowUp aria-hidden="true" className="rl-sort-arrow" />
      </button>
    </th>
  );
}

export function SortStage({ state, update }: StageProps<{ by: SortKey }>) {
  const rows = [...DISKS].sort((a, b) =>
    state.by === "size"
      ? b.gib - a.gib || a.device.localeCompare(b.device)
      : a.device.localeCompare(b.device),
  );
  const flip = useFlip(rows, (d) => d.device, {
    duration: "--duration-base",
    curve: "--ease-standard",
    reduced: "cut",
    hold: false,
  });
  return (
    <table className="rl-table" ref={flip.containerProps.ref}>
      <thead>
        <tr>
          <SortHeader
            label="Disk"
            active={state.by === "device"}
            dir="ascending"
            onSort={() => {
              update(() => ({ by: "device" }));
            }}
          />
          <SortHeader
            label="Size"
            active={state.by === "size"}
            dir="descending"
            onSort={() => {
              update(() => ({ by: "size" }));
            }}
          />
        </tr>
      </thead>
      <tbody>
        {flip.items.map((d) => (
          <tr key={d.device} data-flip-id={d.device} className="rl-trow">
            <td>
              <span className="rl-strong rl-mono">{d.device}</span>{" "}
              <span className="rl-muted">{d.kind}</span>
            </td>
            <td className="rl-num">{d.size}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Expand a row ─────────────────────────────────────────────────────────────────────────────

export function ExpandStage({ state, update }: StageProps<{ open: boolean }>) {
  return (
    <div className="rl-listrow rl-expandrow">
      <Disclosure
        open={state.open}
        onOpenChange={(open) => {
          update(() => ({ open }));
        }}
      >
        <div className="rl-expand-head">
          <span className="rl-strong">Photos</span>
          <span className="rl-muted">Data drive</span>
          <DisclosureTrigger variant="inline">Details</DisclosureTrigger>
        </div>
        <DisclosurePanel>
          <dl className="rl-facts rl-facts-late">
            <div>
              <dt>Full path</dt>
              <dd className="rl-mono">
                /srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/Photos/
              </dd>
            </div>
            <div>
              <dt>Reached by</dt>
              <dd>Windows and Mac</dd>
            </div>
            <div>
              <dt>Who can open it</dt>
              <dd>Alex and Sam, read and change</dd>
            </div>
          </dl>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}

// ─── Selection bar ────────────────────────────────────────────────────────────────────────────

const SEL_ROWS = ["Photos", "Music", "Documents"];

export function SelectStage({
  state,
  update,
}: StageProps<{ picked: readonly string[] }>) {
  const count = state.picked.length;
  return (
    <div className="rl-selection">
      <Crossfade contentKey={count > 0 ? "bar" : "tools"}>
        {count > 0 ? (
          <div
            className="rl-selbar"
            role="toolbar"
            aria-label="Actions for the selected rows"
          >
            <span className="rl-selbar-count">
              <RollingNumber value={count} /> selected
            </span>
            <Button variant="neutral" size="sm">
              Stop sharing
            </Button>
            <Button variant="neutral" size="sm">
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update(() => ({ picked: [] }));
              }}
            >
              Clear
            </Button>
          </div>
        ) : (
          <div className="rl-toolbar">
            <span className="rl-muted">Three shared folders</span>
            <Button variant="primary" size="sm">
              Add a shared folder
            </Button>
          </div>
        )}
      </Crossfade>
      <ul className="rl-rows">
        {SEL_ROWS.map((name) => {
          const on = state.picked.includes(name);
          return (
            <li key={name} className="rl-listrow" data-picked={on || undefined}>
              <Checkbox
                aria-label={`Select ${name}`}
                checked={on}
                onCheckedChange={() => {
                  update((s) => ({
                    picked: on
                      ? s.picked.filter((n) => n !== name)
                      : [...s.picked, name],
                  }));
                }}
              />
              <span className="rl-strong">{name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────────────────────

export function QuickStage({ state }: StageProps<{ pointed: string | null }>) {
  return (
    <ul className="rl-rows">
      {SEL_ROWS.map((name) => (
        <li
          key={name}
          className="rl-listrow rl-qrow"
          data-pointed={state.pointed === name || undefined}
        >
          <span className="rl-strong">{name}</span>
          <span className="rl-quick">
            <Button variant="ghost" size="sm">
              Open
            </Button>
            <Button variant="ghost" size="sm">
              Sharing
            </Button>
          </span>
          <Button
            variant="plain"
            size="icon-sm"
            aria-label={`More for ${name}`}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ─── Copy ─────────────────────────────────────────────────────────────────────────────────────

export function CopyStage({ state, update }: StageProps<{ copies: number }>) {
  return (
    <div className="rl-copyrow">
      <span className="rl-label">Full path</span>
      <span className="rl-mono rl-path">
        /srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/Photos/
      </span>
      <CopyGlyphButton
        copies={state.copies}
        label="Copy the path"
        onCopy={() => {
          update((s) => ({ copies: s.copies + 1 }));
        }}
      />
    </div>
  );
}

// ─── Bars ─────────────────────────────────────────────────────────────────────────────────────

export interface BarsState {
  visit: number;
  more: boolean;
}

function BarsStage({ state }: StageProps<BarsState>) {
  const { first, done } = useFirstTime("motion.table-bars");
  // Fill from zero only on the page's first visit in this browser, and only when a cause asked.
  const [fill] = useState(() => state.visit > 0 && first);
  useEffect(() => {
    if (fill) {
      done();
    }
  }, [fill, done]);
  const rows = [
    { name: "System drive", used: 0.1, free: "16.9 GiB" },
    {
      name: "Data drive",
      used: state.more ? 0.64 : 0.62,
      free: state.more ? "1.3 TiB" : "1.4 TiB",
    },
    { name: "Backup", used: 0.41, free: "2.1 TiB" },
    { name: "tank", used: 0.28, free: "2.6 TiB" },
  ];
  return (
    <table className="rl-table" data-fill={fill || undefined}>
      <thead>
        <tr>
          <th scope="col">File system</th>
          <th scope="col">Used</th>
          <th scope="col" className="rl-num">
            Free
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="rl-trow">
            <td className="rl-strong">{r.name}</td>
            <td>
              <span className="rl-usage-cell">
                <span
                  className="rl-usage"
                  role="meter"
                  aria-label={`${r.name} used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(r.used * 100)}
                >
                  <span
                    className="rl-usage-fill"
                    style={{ "--v": r.used } as CSSProperties}
                  />
                </span>
                <span className="rl-num">{Math.round(r.used * 100)} %</span>
              </span>
            </td>
            <td className="rl-num">{r.free}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A visit draws the table afresh. */
export function BarsVisit(props: StageProps<BarsState>) {
  return <BarsStage key={props.state.visit} {...props} />;
}
