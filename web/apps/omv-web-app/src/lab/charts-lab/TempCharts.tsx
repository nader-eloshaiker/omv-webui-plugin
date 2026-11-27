// SPDX-License-Identifier: GPL-3.0-or-later
// The disks' temperatures by kind, the owner's choice (round four), grouped by array and pool:
// DiskMgmt.getList `temperature` and `powermode` (a read that never wakes a sleeping disk, so a disk
// in standby has no figure), the alert limit from Smart.getSettings `tempmax` (Smart.getDeviceSettings
// `tempmax` for one disk), and the groups from MdMgmt.enumerateDevices, Zfs.getPoolStatus and
// Zfs.getPoolDevices (model.ts, diskGroups). One reading, when the page opened: no history.
// Development only (UI-11).
//
// Each disk is drawn as its kind (DrivePicture.tsx), in the neutral inks: the shape says the kind.
// Every level is a solid bar with no outline (owner, round four: "follow the waffle approach, all
// filled and no outline"): the empty part in the slate (--ch-empty), the level in the usage blue,
// and the warning colour only on a disk at or past its limit, together with the words that say so.
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  StatusIcon,
  StatusLabel,
} from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useId } from "react";
import { DrivePicture } from "./DrivePicture.tsx";
import type { DiskGroup, DiskTemp } from "./model.ts";
import {
  celsius,
  dashboardSplit,
  diskCount,
  listWords,
  overLimit,
  restWords,
  sharedLimit,
  tempScale,
} from "./model.ts";

const v = (name: string, value: number) =>
  ({ [name]: String(value) }) as CSSProperties;

function AsleepNote({ disks }: { disks: readonly DiskTemp[] }) {
  const asleep = disks.filter((d) => d.asleep).map((d) => d.device);
  if (asleep.length === 0) {
    return null;
  }
  return (
    <p className="ch-note">
      {listWords(asleep)} {asleep.length === 1 ? "is" : "are"} asleep, so{" "}
      {asleep.length === 1 ? "its temperature was" : "their temperatures were"}{" "}
      not read: the disk list never wakes a disk to read it.
    </p>
  );
}

/** The disks at or past their limit, in words: the only place the warning colour is explained. */
function OverNote({ disks }: { disks: readonly DiskTemp[] }) {
  const over = disks.filter(overLimit);
  const first = over[0];
  if (first === undefined || first.limit === null) {
    return null;
  }
  const words = listWords(
    over.map((d) => `${d.device} is at ${celsius(d.c ?? 0)}`),
  );
  return (
    <p className="ch-note ch-over-note">
      <StatusLabel status="warning">
        {`${words}, at or over the alert limit of ${celsius(first.limit)}.`}
      </StatusLabel>
    </p>
  );
}

/** One disk: its picture, and beside it (under it, for a stick) its level on the shared scale. */
function KindTile({
  d,
  k,
  limitAt,
}: {
  d: DiskTemp;
  /** Where the reading sits on the scale, 0 to 1. */
  k: number;
  limitAt: number | null;
}) {
  const over = overLimit(d);
  return (
    <li
      className="ch-kt"
      data-kind={d.kind}
      data-unread={d.c === null || undefined}
      data-over={over || undefined}
    >
      <span className="ch-kt-art" aria-hidden="true">
        <DrivePicture kind={d.kind} size="tile" />
        {/* A disk with no reading has no bar at all, only its word: nothing to fill, no outline. */}
        <span className="ch-kt-bar">
          {d.c === null ? null : (
            <span className="ch-kt-level" style={v("--k", k)} />
          )}
        </span>
        {limitAt === null ? null : (
          <span className="ch-kt-limit" style={v("--y", limitAt)} />
        )}
      </span>
      <span className="ch-kt-device">{d.device}</span>
      <span className="ch-sr">: </span>
      <span className="ch-kt-value">
        {d.c === null ? (
          d.asleep ? (
            "Asleep"
          ) : (
            "Not read"
          )
        ) : over ? (
          <>
            <StatusIcon status="warning" />
            {celsius(d.c)}
            <span className="ch-sr">, at or over the alert limit</span>
          </>
        ) : (
          celsius(d.c)
        )}
      </span>
    </li>
  );
}

/** A group: its heading (an array's or pool's name and arrangement, or a kind), then its disks. */
function Group({
  g,
  at,
  limitAt,
  readAt,
}: {
  g: DiskGroup;
  at: (c: number) => number;
  limitAt: number | null;
  readAt: string;
}) {
  const id = useId();
  return (
    <section className="ch-kind" data-from={g.from} aria-labelledby={id}>
      <div className="ch-kind-head">
        <h4 id={id} className="ch-kind-title">
          {g.title}
        </h4>
        {g.state === null ? null : (
          <StatusLabel status={g.state.tone}>{g.state.words}</StatusLabel>
        )}
      </div>
      <ul
        className="ch-kind-tiles"
        aria-label={`${g.title}, read at ${readAt}`}
      >
        {g.disks.map((d) => (
          <KindTile
            key={d.device}
            d={d}
            k={d.c === null ? 0 : at(d.c)}
            limitAt={limitAt}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * The disks in groups: each RAID array and ZFS pool with its member disks, then the disks in no
 * array or pool by kind, each in device order, since the disk list does not say which slot of the
 * case a disk is in. Each tile is the disk's picture with its temperature as a level beside it, on
 * one scale shared by every group: the alert limit is one dashed line at the same height through
 * every upright tile, and a mark at the same temperature on each stick. A sleeping disk shows
 * "Asleep" and no bar.
 *
 * On the dashboard (`place="dashboard"`), past eight disks only the groups with a disk over its
 * limit are shown, the rest summed up in a sentence and opened by a disclosure (model.ts,
 * dashboardSplit); the scale is still the one every disk shares.
 */
export function TempByKind({
  groups,
  readAt,
  place = "page",
}: {
  groups: readonly DiskGroup[];
  readAt: string;
  place?: "page" | "dashboard";
}) {
  const disks = groups.flatMap((g) => g.disks);
  const limit = sharedLimit(disks);
  const { lo, hi } = tempScale(disks, limit);
  const at = (c: number) => Math.min(1, Math.max(0, (c - lo) / (hi - lo)));
  const limitAt = limit === null ? null : at(limit);
  const hasStick = disks.some((d) => d.kind === "nvme");
  const split =
    place === "dashboard"
      ? dashboardSplit(groups)
      : { shown: [...groups], rest: [] };
  const restDisks = split.rest.flatMap((g) => g.disks);
  const list = (gs: readonly DiskGroup[]) => (
    <div className="ch-groups">
      {gs.map((g) => (
        <Group key={g.id} g={g} at={at} limitAt={limitAt} readAt={readAt} />
      ))}
    </div>
  );
  return (
    <div className="ch-kinds" data-place={place}>
      {split.shown.length === 0 ? null : list(split.shown)}
      <OverNote disks={disks} />
      {split.rest.length === 0 ? null : (
        <div className="ch-rest">
          <p className="ch-rest-words">
            {restWords(restDisks, split.shown.length === 0, limit)}
          </p>
          <Disclosure>
            <DisclosureTrigger variant="inline">
              {split.shown.length === 0
                ? `Show all ${diskCount(restDisks.length)}`
                : `Show the other ${diskCount(restDisks.length)}`}
            </DisclosureTrigger>
            <DisclosurePanel>{list(split.rest)}</DisclosurePanel>
          </Disclosure>
        </div>
      )}
      <AsleepNote disks={disks} />
      {place === "page" ? (
        <p className="ch-note">
          Each RAID array and ZFS pool is a group of its own, from the RAID and
          ZFS lists, and the disks in neither are grouped by kind. Every level
          is on the same scale, from {celsius(lo)} to {celsius(hi)}: from the
          bottom up beside each upright disk
          {hasStick ? ", and from left to right under each NVMe stick" : ""}.
          {limit === null
            ? ""
            : ` The dashed line through the tiles${hasStick ? ", and the mark on each stick," : ""} is the alert limit, ${celsius(limit)}.`}{" "}
          Within a group the disks are in device order: the NAS does not report
          which slot of the case a disk is in.
        </p>
      ) : null}
    </div>
  );
}
