// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS slice's words (phase 5 ZFS design 0.2 to 0.5): a pool's layout, what it can lose, its state's
// reason with the progress, the last check, a disk's role, compression, and the blockers. Server values
// sit in our sentences as text, each in its own slot (UI-2).
import type { ZfsObject } from "@omv-webui/react-api-omv/generated";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { IdentifierText } from "../components/atoms/IdentifierText.tsx";
import { formatBytes } from "../format/format.ts";
import { useFormat } from "../format/useFormat.ts";
import {
  compressionSaving,
  compressionWord,
  dataGroups,
  protectionOf,
  readLastScrub,
  type DiskBlocker,
  type LayoutKey,
  type PoolDisk,
  type PoolReport,
  type PoolState,
  type Protection,
  type Role,
  type Scan,
} from "../zfs/zfsModel.ts";

/** A report name as people read it: its last part, without "-part1". */
export const diskLabel = (name: string): string =>
  (name.split("/").pop() ?? name).replace(/-part\d+$/, "");

export function useZfsWords() {
  const { t } = useTranslation();
  const format = useFormat();

  const layoutWord = (key: LayoutKey | null): string =>
    key === null || key === "other"
      ? t("zfsLayout.unknown")
      : t(`zfsLayout.${key}`);

  /** "Mirror, 2 disks"; "2 groups, 4 disks"; "Not known" for an unread report (1.3). */
  const poolLayout = (report: PoolReport | null): string => {
    const groups = report === null ? [] : dataGroups(report);
    if (groups.length === 0) {
      return t("zfsLayout.unknown");
    }
    const disks = groups.reduce((n, g) => n + g.entries.length, 0);
    if (groups.length > 1) {
      return t("zfsLayout.groups", { groups: groups.length, disks });
    }
    const group = groups[0];
    return t("zfsLayout.withDisks", {
      layout: layoutWord(group?.layout ?? null),
      count: disks,
    });
  };

  const protectionText = (p: Protection | null): string => {
    if (p === null) {
      return t("zfsProtect.unknown");
    }
    switch (p.key) {
      case "mirror":
      case "parity":
      case "groups":
        return t(`zfsProtect.${p.key}`, { count: p.count });
      default:
        return t(`zfsProtect.${p.key}`);
    }
  };

  const percentText = (value: number) => `${value.toFixed(1)}%`;

  /** 0.2: "27.0% done, about 10 minutes left". */
  const progressText = (scan: Scan | null): string => {
    if (scan === null || scan.percent === null) {
      return t("zfsState.progressUnknown");
    }
    const percent = percentText(scan.percent);
    return scan.secondsLeft === null
      ? t("zfsState.progressNoTime", { percent })
      : t("zfsState.progress", {
          percent,
          left: format.duration(Math.max(60, scan.secondsLeft)),
        });
  };

  const disk = (name: string | null) => (
    <IdentifierText value={diskLabel(name ?? "")} />
  );

  /** 0.3: the reason beside the pill; null for a pool that is fine. */
  const stateReason = (state: PoolState, report: PoolReport): ReactNode => {
    const protection = protectionText(protectionOf(report));
    switch (state.kind) {
      case "unread":
        return t("zfsState.unread");
      case "unusable":
        return t("zfsState.unusable");
      case "suspended":
        return t("zfsState.suspended");
      case "dataErrors":
        return t("zfsState.dataErrors");
      case "degradedRebuilding":
        return (
          <Trans
            i18nKey="zfsState.degradedRebuilding"
            values={{ progress: progressText(state.scan), protection }}
            components={{ disk: disk(state.disk) }}
          />
        );
      case "degraded":
        return t("zfsState.degraded", { protection });
      case "copying":
        return (
          <Trans
            i18nKey="zfsState.copying"
            values={{ progress: progressText(state.scan) }}
            components={{ disk: disk(state.disk) }}
          />
        );
      case "removing":
        return t("zfsState.removing");
      case "diskErrors":
        return (
          <Trans
            i18nKey="zfsState.diskErrors"
            components={{ disk: disk(state.disk) }}
          />
        );
      case "checking":
        return t("zfsState.checking", { progress: progressText(state.scan) });
      case "checkPaused":
        return t("zfsState.checkPaused", {
          percent:
            state.scan?.percent == null ? "" : percentText(state.scan.percent),
        });
      case "unrecognised":
        return t("zfsState.unrecognised", { state: state.text });
      case "ok":
        return null;
    }
  };

  const statusWord = (status: PoolState["status"]) => t(`health.${status}`);

  /** A date the plugin wrote: in this computer's format and time zone, or as written. */
  const dateText = (at: number | null, text: string): string =>
    at === null ? text : format.dateTime(at / 1000);

  /** 0.2: the last check, from lastscrub (the date, with its time zone) and the scan line (its kind). */
  const lastCheck = (
    row: Pick<ZfsObject, "lastscrub">,
    report: PoolReport | null,
    now: number,
  ): { main: string; date: string | null; old: boolean } => {
    const last = readLastScrub(row.lastscrub);
    const scan = report?.known === true ? report.scan : null;
    if (last.kind === "unknown") {
      return { main: t("zfsCheck.notKnown"), date: null, old: false };
    }
    if (last.kind === "never") {
      return { main: t("zfsCheck.never"), date: null, old: true };
    }
    if (last.kind === "running" || last.kind === "paused") {
      return {
        main: progressText(scan),
        date: dateText(last.at, last.text),
        old: false,
      };
    }
    if (last.kind === "stopped") {
      return {
        main: t("zfsCheck.stopped", { date: dateText(last.at, last.text) }),
        date: null,
        old: false,
      };
    }
    if (scan?.kind === "rebuild") {
      return {
        main: t("zfsCheck.afterRebuild", {
          date: dateText(last.at, last.text),
        }),
        date: null,
        old: false,
      };
    }
    const when =
      last.at === null
        ? last.text
        : t("zfsCheck.ago", {
            duration: format.duration(Math.max(60, (now - last.at) / 1000)),
          });
    const old =
      last.at === null ? false : now - last.at > 35 * 24 * 3600 * 1000;
    return {
      main: t("zfsCheck.last", { when }),
      date: last.at === null ? null : dateText(last.at, last.text),
      old,
    };
  };

  const roleWord = (role: Role) => t(`zfsRole.${role}`);

  /** The words under a role, when it needs any (0.4). */
  const roleDetail = (d: PoolDisk): string | null => {
    switch (d.role) {
      case "workingErrors":
        return t("zfsRole.errors", {
          read: d.disk.read,
          write: d.disk.write,
          checksum: d.disk.checksum,
        });
      case "failing":
        return t("zfsRole.failingBody");
      case "missing":
        return t("zfsRole.missingBody");
      case "removed":
        return t("zfsRole.removedBody");
      case "offline":
        return t("zfsRole.offlineBody");
      case "spare":
        return t("zfsRole.spareWaiting");
      default:
        return null;
    }
  };

  /** 0.2: "On (LZ4), saves about 18%". */
  const compressionText = (
    row: Pick<ZfsObject, "compression" | "compressratio">,
  ): ReactNode => {
    const word = compressionWord(row.compression);
    const saving = compressionSaving(row.compressratio);
    const base =
      word === "other" ? (
        <Trans
          i18nKey="zfsFs.compression.other"
          components={{
            value: <IdentifierText value={row.compression ?? ""} />,
          }}
        />
      ) : (
        t(`zfsFs.compression.${word}`)
      );
    return saving === null || word === "off" ? (
      base
    ) : (
      <>
        {base},{" "}
        {t("zfsFs.compression.saves", { percent: `${String(saving)}%` })}
      </>
    );
  };

  /** Compression as plain text, for a sentence: "On (LZ4)", "Off", "On (zstd)". */
  const compressionPlain = (value: string | undefined): string => {
    const word = compressionWord(value);
    return word === "other"
      ? t("zfsFs.compression.otherPlain", { value: value ?? "" })
      : t(`zfsFs.compression.${word}`);
  };

  /** "1.2 TiB of about 7.1 TiB used", from the pool's own folder (0.2, D6). */
  const spaceText = (
    root: Pick<ZfsObject, "used" | "available"> | undefined,
  ) =>
    root === undefined
      ? t("zfs.spaceUnknown")
      : t("zfs.space", {
          used: formatBytes(root.used),
          total: formatBytes(root.used + root.available),
        });

  const blockerText = (b: DiskBlocker): string => {
    switch (b.kind) {
      case "unknown":
        return t("zfsBlock.unknown");
      case "unusable":
        return t("zfsBlock.unusable");
      case "full":
        return t("zfsBlock.full");
      case "changing":
        return t("zfsBlock.changing");
      case "critical":
        return t("zfsBlock.critical");
      case "rebuilding":
        return t("zfsBlock.rebuilding");
      case "checking":
        return t("zfsBlock.checking");
      case "rolesUnknown":
        return t("zfsBlock.rolesUnknown");
      case "notById":
        return t("zfsBlock.notById");
      case "noCopy":
        return t("zfsBlock.noCopy");
      case "class":
        return t("zfsBlock.class");
      case "notWorking":
        return t("zfsBlock.notWorking");
      case "lastCopy":
        return t("zfsBlock.lastCopy");
      case "notOffline":
        return t("zfsBlock.notOffline");
    }
  };

  return {
    layoutWord,
    poolLayout,
    protectionText,
    progressText,
    percentText,
    stateReason,
    statusWord,
    lastCheck,
    roleWord,
    roleDetail,
    compressionText,
    compressionPlain,
    spaceText,
    blockerText,
    dateText,
  };
}
