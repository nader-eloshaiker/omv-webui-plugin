// SPDX-License-Identifier: GPL-3.0-or-later
// Every word the dashboard's library pieces say, from the catalogue: the map, the answer, the
// temperatures and the mapping of the reads (dashboard/nasModel.ts). The library carries no words,
// and each function here gets its figures and names from a read, never invents one (style guide 10).
import type {
  DiskGroup,
  DiskTemperature,
  DiskTemperaturesLabels,
  DiskTemperaturesRestLabels,
  NasAnswerWords,
  NasMapWords,
  NasRead,
  PoolLayout,
  RestSummary,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import type { NasModelWords } from "../dashboard/nasModel.ts";
import { useFormat } from "../format/useFormat.ts";

const NUMBER_WORDS = new Set(["2", "3", "4", "5", "6", "7", "8", "9", "10"]);

export function useNasWords() {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const lists = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const list = (items: readonly string[]): string => lists.format(items);
  const celsius = (c: number) => t("dashboard.temps.celsius", { value: c });
  const kindName = (kind: DiskTemperature["kind"]) =>
    t(`dashboard.kind.${kind ?? "unknown"}`);
  /** A count in words up to ten, capitalised, then in figures. */
  const countWord = (n: number) =>
    NUMBER_WORDS.has(String(n))
      ? t(`dashboard.answer.numbers.${String(n) as "2"}`)
      : String(n);

  const model: NasModelWords = {
    health: (state) => t(`health.${state}`),
    notChecked: t("dashboard.map.notChecked"),
    noReading: t("dashboard.map.noReading"),
    asleep: t("dashboard.map.asleep"),
    celsius,
    diskSummary: (kind, size) =>
      size === null
        ? t(`dashboard.kind.${kind}`)
        : t("dashboard.map.diskSummary", {
            kind: t(`dashboard.kind.${kind}`),
            size,
          }),
    storageState: (state) =>
      state === "below"
        ? t("health.ok")
        : t(`dashboard.map.storageState.${state}`),
    poolState: (state) => t(`dashboard.map.poolState.${state}`),
    systemDrive: t("dashboard.storage.systemDrive"),
    zfsPool: t("dashboard.map.zfsPool"),
    fsType: (type) => {
      const key = `fsType.${type.toLowerCase()}`;
      return i18n.exists(key) ? t(key as "fsType.ext4") : type.toUpperCase();
    },
    raidDisksNote: t("dashboard.map.raidDisksNote"),
    poolDisksUnread: t("dashboard.map.poolDisksUnread"),
    folderState: () => t("dashboard.map.folderStatus"),
    way: (id) => ({
      name: t(`dashboard.map.ways.${id}.name`),
      tech: t(`dashboard.map.ways.${id}.tech`),
    }),
    speed: (mbit) => format.speed(mbit),
  };

  const lanes = (["disks", "storage", "folders", "ways", "network"] as const)
    .map((lane) => [
      lane,
      {
        title: t(`dashboard.map.lanes.${lane}.title`),
        caption: t(`dashboard.map.lanes.${lane}.caption`),
      },
    ])
    .reduce(
      (all, [lane, words]) => ({ ...all, [lane as string]: words }),
      {} as NasMapWords["lanes"],
    );

  const map: NasMapWords = {
    title: t("dashboard.map.title"),
    lanes,
    rowsLabel: t("dashboard.map.rowsLabel"),
    keyboardHint: t("dashboard.map.keyboardHint"),
    list,
    disksUnread: t("dashboard.map.disksUnread"),
    disksNone: t("dashboard.map.disksNone"),
    sharedDiskState: (label, devices) =>
      t("dashboard.map.sharedDiskState", { label, list: list(devices) }),
    strip: ({ count, ok, unchecked, more }) => {
      const lead = more
        ? t("dashboard.map.stripMore", { count })
        : t("dashboard.map.disks", { count });
      if (unchecked === 0) {
        return t("dashboard.map.stripAllOk", { lead });
      }
      if (ok === 0) {
        return t("dashboard.map.stripNotChecked", { lead });
      }
      return t("dashboard.map.stripMixed", { lead, ok, unchecked });
    },
    diskLabel: (d) =>
      [
        d.device,
        d.summary,
        d.healthLabel,
        d.detail,
        d.alsoIn.length > 0
          ? t("dashboard.map.alsoInLower", { list: list(d.alsoIn) })
          : undefined,
      ]
        .filter(Boolean)
        .join(", "),
    alsoIn: (names) => t("dashboard.map.alsoIn", { list: list(names) }),
    atRisk: t("dashboard.map.atRisk"),
    foldersUnread: t("dashboard.map.foldersUnread"),
    foldersNone: t("dashboard.map.foldersNone"),
    systemNoFolders: t("dashboard.map.systemNoFolders"),
    noWayIn: t("dashboard.map.noWayIn"),
    wayShort: {
      smb: t("dashboard.map.wayShort.smb"),
      nfs: t("dashboard.map.wayShort.nfs"),
      rsync: t("dashboard.map.wayShort.rsync"),
      ssh: t("dashboard.map.wayShort.ssh"),
    },
    folderLabel: ({ name, ways, state }) => {
      const base =
        ways.length > 0
          ? t("dashboard.map.folderReached", { name, list: list(ways) })
          : t("dashboard.map.folderUnreached", { name });
      return state ? `${base}, ${state.toLowerCase()}` : base;
    },
    moreFolders: (count, ok) =>
      ok
        ? t("dashboard.map.moreFoldersOk", { count })
        : t("dashboard.map.moreFolders", { count }),
    rowLabel: (r) => {
      const on =
        r.devices.length === 0
          ? ""
          : t("dashboard.map.rowOn", {
              count: r.devices.length,
              list: list(r.devices),
            });
      const used =
        r.used === null
          ? t("dashboard.map.rowNoReading")
          : t("dashboard.map.rowUsed", { percent: Math.round(r.used * 100) });
      const own = r.problem ? `, ${r.problem.toLowerCase()}` : "";
      const sick = r.sick
        .map((d) =>
          t("dashboard.map.rowSick", {
            device: d.device,
            state: d.label.toLowerCase(),
          }),
        )
        .join("");
      const held =
        r.folders.length > 0
          ? r.atRisk
            ? t("dashboard.map.rowFoldersAtRisk", { list: list(r.folders) })
            : t("dashboard.map.rowFolders", { list: list(r.folders) })
          : r.system
            ? t("dashboard.map.rowSystem")
            : t("dashboard.map.rowNoFolders");
      const note = r.disksNote ? ` ${r.disksNote}` : "";
      return `${r.name}${on}: ${used}${own}${sick}. ${held}${note}`;
    },
    raidMembers: (devices) =>
      t("dashboard.map.raidMembers", {
        count: devices.length,
        list: list(devices),
      }),
    raidMembersLabel: ({ devices, sick }) =>
      t("dashboard.map.raidMembersLabel", {
        count: devices.length,
        list: list(devices),
        sick: sick
          .map((d) =>
            t("dashboard.map.rowSick", {
              device: d.device,
              state: d.label.toLowerCase(),
            }),
          )
          .join(""),
      }),
    unused: (devices) =>
      t("dashboard.map.unused", { count: devices.length, list: list(devices) }),
    unusedLabel: (devices) =>
      t("dashboard.map.unusedLabel", {
        count: devices.length,
        list: list(devices),
      }),
    unusedFolders: t("dashboard.map.unusedFolders"),
    moreRows: {
      link: (count, ok) =>
        ok
          ? t("dashboard.map.moreRowsLinkOk", { count })
          : t("dashboard.map.moreRowsLink", { count }),
      disks: (count) => t("dashboard.map.disks", { count }),
      folders: (names, count) =>
        t("dashboard.map.moreRowsFolders", { count, list: list(names) }),
    },
    example: {
      device: t("dashboard.map.example.device"),
      storage: t("dashboard.map.example.storage"),
      tech: t("dashboard.map.example.tech"),
      folder: t("dashboard.map.example.folder"),
      tag: t("dashboard.map.example.tag"),
    },
    waysRunning: (running, total) =>
      running === total
        ? t("dashboard.map.waysAllRunning")
        : t("dashboard.map.waysRunning", { running, total }),
    running: t("dashboard.map.running"),
    notRunning: t("dashboard.map.notRunning"),
    noWayOn: t("dashboard.map.noWayOn"),
    off: (names) => t("dashboard.map.off", { list: list(names) }),
    wayLabel: ({ name, tech, running, over }) => {
      const via =
        over.length > 0 ? t("dashboard.map.wayOver", { list: list(over) }) : "";
      return running
        ? t("dashboard.map.wayRunning", { name, tech, over: via })
        : t("dashboard.map.wayStopped", { name, tech, over: via });
    },
    notConnected: t("dashboard.map.notConnected"),
    world: t("dashboard.map.world"),
    laneError: (lane) => t(`dashboard.map.laneError.${lane}`),
    retry: t("common.tryAgain"),
    retrying: t("dashboard.map.retrying"),
  };

  const readNames = (reads: readonly NasRead[]) =>
    list(reads.map((r) => t(`dashboard.answer.read.${r}`)));

  /**
   * The answer's words. `checking` says whether disk health is being read now: when only the disks'
   * health is still to come, the answer says so instead of "Reading the NAS…", and never that all
   * is well (fail closed).
   */
  const answer = (checking: boolean): NasAnswerWords => ({
    needs: (count) =>
      count === 1
        ? t("dashboard.answer.needs", { count })
        : t("dashboard.answer.needs", { count, word: countWord(count) }),
    unread: (failed) => ({
      title: t("dashboard.answer.unreadTitle"),
      reason: t("dashboard.answer.unreadReason", { list: readNames(failed) }),
    }),
    welcome: {
      title: t("dashboard.answer.welcomeTitle"),
      reason: t("dashboard.answer.welcomeReason"),
    },
    reading: (waiting) =>
      waiting.length === 1 && waiting[0] === "health"
        ? {
            title: t("dashboard.answer.notCheckedTitle"),
            reason: checking
              ? t("dashboard.answer.checkingReason")
              : t("dashboard.answer.notCheckedReason"),
          }
        : { title: t("dashboard.answer.reading") },
    ok: ({ total, withSpace, checkedAt }) => ({
      title: t("dashboard.answer.okTitle"),
      reason: `${t("dashboard.answer.okDisks", { time: checkedAt ?? "" })} ${
        withSpace === total
          ? t("dashboard.answer.okSpace", { count: total })
          : t("dashboard.answer.okSpaceSome", {
              some: withSpace,
              count: total,
            })
      }`,
    }),
  });

  const layoutWords = (l: PoolLayout): string => {
    if (l.kinds.length === 0) {
      return t(
        l.members === 1
          ? "dashboard.temps.layout.single"
          : "dashboard.temps.layout.stripe",
      );
    }
    const kinds = list(
      l.kinds.map((k) =>
        i18n.exists(`dashboard.temps.layout.${k}`)
          ? t(`dashboard.temps.layout.${k as "mirror"}`)
          : k,
      ),
    );
    return l.groups === 1
      ? kinds
      : t("dashboard.temps.layout.groups", { kinds, count: l.groups });
  };

  const groupTitle = (g: DiskGroup): string => {
    switch (g.from) {
      case "md":
        return t("dashboard.temps.arrayTitle", { name: g.name ?? g.device });
      case "zfs":
        return t("dashboard.temps.poolTitle", {
          name: g.name,
          layout: layoutWords(g.layout),
        });
      case "kind":
        return t(`dashboard.temps.kindTitle.${g.kind ?? "unknown"}`);
    }
  };

  /**
   * The disks at or over their alert limit, in one sentence: "sdk is at 46 °C and sdt is at 46 °C, at
   * or over the alert limit of 45 °C." The temperatures and what needs you both say it with this.
   */
  const overNote = (over: readonly DiskTemperature[]): string =>
    t("dashboard.temps.overNote", {
      list: list(
        over.map((d) =>
          t("dashboard.temps.overOne", {
            device: d.device,
            c: celsius(d.c ?? 0),
          }),
        ),
      ),
      limit: celsius(over[0]?.limit ?? 0),
    });

  const temperatures = (readAt: string): DiskTemperaturesLabels => ({
    groupTitle,
    groupState: (s) => t(`dashboard.temps.state.${s.reason}`),
    listName: (title) => t("dashboard.temps.listName", { title, time: readAt }),
    celsius,
    asleep: t("dashboard.temps.asleep"),
    notRead: t("dashboard.temps.notRead"),
    overLimit: t("dashboard.temps.overLimit"),
    overNote,
    asleepNote: (devices) =>
      t("dashboard.temps.asleepNote", {
        count: devices.length,
        list: list(devices),
      }),
    hint: (d) =>
      d.limit === null
        ? kindName(d.kind)
        : t("dashboard.temps.hint", {
            kind: kindName(d.kind),
            limit: celsius(d.limit),
          }),
  });

  const rest: DiskTemperaturesRestLabels = {
    summary: (s: RestSummary) => {
      const under =
        s.limit === null
          ? ""
          : t("dashboard.temps.under", { limit: celsius(s.limit) });
      if (s.lo === null || s.hi === null) {
        return s.all
          ? t("dashboard.temps.restNoneAll", { count: s.count })
          : t("dashboard.temps.restNoneOther", { count: s.count });
      }
      const range =
        s.lo === s.hi
          ? t("dashboard.temps.rangeAt", { c: celsius(s.lo) })
          : t("dashboard.temps.rangeBetween", {
              lo: celsius(s.lo),
              hi: celsius(s.hi),
            });
      if (s.read === s.count) {
        return s.all
          ? t("dashboard.temps.restAll", { count: s.count, range, under })
          : t("dashboard.temps.restOther", { count: s.count, range, under });
      }
      return s.all
        ? t("dashboard.temps.restSomeAll", {
            count: s.read,
            total: s.count,
            range,
            under,
          })
        : t("dashboard.temps.restSomeOther", {
            count: s.read,
            total: s.count,
            range,
            under,
          });
    },
    show: (s) =>
      s.all
        ? t("dashboard.temps.showAll", { count: s.count })
        : t("dashboard.temps.showOther", { count: s.count }),
  };

  return {
    model,
    map,
    answer,
    temperatures,
    rest,
    list,
    celsius,
    overNote,
  };
}
