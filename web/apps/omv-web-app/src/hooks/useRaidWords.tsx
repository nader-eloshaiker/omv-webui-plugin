// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID slice's words (phase 5 RAID design 0.1 to 0.4): an array's name (device only, never a host
// part), its level, its state's reason with the progress, what it can lose, and the disk counts. Server
// values sit in our sentences as text, each isolated (Slotted, UI-2).
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import { Identifier } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Slotted } from "../components/atoms/Slotted.tsx";
import { formatBytes, parseByteCount } from "../format/format.ts";
import { useFormat } from "../format/useFormat.ts";
import {
  levelKey,
  protection,
  type ArrayState,
  type BusyWhat,
  type LevelKey,
  type Progress,
  type Protection,
  type Report,
  type Role,
} from "../raid/raidModel.ts";

export function useRaidWords() {
  const { t } = useTranslation();
  const format = useFormat();

  /** 0.1: a level's word; anything else as received. */
  const levelWord = (level: string): string => {
    const key: LevelKey = levelKey(level);
    return key === "other" ? level : t(`raidLevel.${key}`);
  };

  /** "RAID /dev/md0", the device in the mono face. */
  const arrayName = (devicefile: string): ReactNode => (
    <Slotted
      sentence={(tokens) => t("raid.name", tokens)}
      values={{ device: <Identifier>{devicefile}</Identifier> }}
    />
  );
  const arrayNameText = (devicefile: string): string =>
    t("raid.name", { device: devicefile });

  /** 0.1: "45.0% done, about 2 hours left". */
  const progressText = (progress: Progress | null): string => {
    if (progress === null) {
      return t("raidState.progressUnknown");
    }
    const percent = `${progress.percent.toFixed(1)}%`;
    return progress.minutesLeft === null
      ? t("raidState.progressNoTime", { percent })
      : t("raidState.progress", {
          percent,
          left: format.duration(Math.max(60, progress.minutesLeft * 60)),
        });
  };

  /** 0.4's sentence. */
  const protectionText = (p: Protection | null): string =>
    p === null
      ? ""
      : p.key === "mirror"
        ? t("raidProtect.mirror", { count: p.count })
        : t(`raidProtect.${p.key}`);

  /** The array as it is now: its level less the disks short. */
  const protectionNow = (
    row: Pick<MdArray, "level" | "numdevices">,
    state: ArrayState,
  ): string =>
    protectionText(
      protection(levelKey(row.level), row.numdevices, state.short ?? 0),
    );

  /** 0.2: the reason beside the pill; null when the state needs none (OK). */
  const stateReason = (
    row: Pick<MdArray, "level" | "numdevices">,
    state: ArrayState,
  ): ReactNode => {
    const progress = progressText(state.progress);
    const key = levelKey(row.level);
    // RAID6 with one disk short can lose one more (0.2).
    const oneLeft = key === "raid6" && state.short !== null && state.short <= 1;
    switch (state.kind) {
      case "unread":
        return t("raidState.unread");
      case "inactive":
        return t("raidState.inactive");
      case "failed":
        return t("raidState.failed");
      case "rebuilding":
        return state.rebuildingOnto === null ? (
          t("raidState.rebuildingNoDisk", { progress })
        ) : (
          <Slotted
            sentence={(tokens) =>
              t(
                oneLeft
                  ? "raidState.rebuildingOneLeft"
                  : "raidState.rebuilding",
                { ...tokens, progress },
              )
            }
            values={{ disk: <Identifier>{state.rebuildingOnto}</Identifier> }}
          />
        );
      case "degraded":
        return oneLeft
          ? t("raidState.degradedOneLeft")
          : t("raidState.degraded");
      case "reshaping":
        return t("raidState.reshaping", { progress });
      case "resyncPending":
        return t("raidState.resyncPending");
      case "resyncDelayed":
        return t("raidState.resyncDelayed");
      case "resyncing":
        return t("raidState.resyncing", { progress });
      case "checking":
        return t("raidState.checking", { progress });
      case "repairing":
        return t("raidState.repairing", { progress });
      case "ok":
        return null;
      case "unrecognised":
        return (
          <Slotted
            sentence={(tokens) => t("raidState.unrecognised", tokens)}
            values={{ state: <span dir="auto">{state.text}</span> }}
          />
        );
    }
  };

  /** The pill's word, the fixed status words. */
  const statusWord = (state: ArrayState): string => t(`health.${state.status}`);

  /** "1 of 2 disks working", "and 1 spare"; "2 disks" when the report could not be read. */
  const disksText = (
    row: Pick<MdArray, "numdevices">,
    report: Report | null,
  ): string => {
    if (report === null || !report.known) {
      return t("raid.disksCount", { count: row.numdevices });
    }
    const working = t("raid.disksWorking", {
      working: report.working,
      total: row.numdevices,
    });
    return report.spares > 0
      ? `${working} ${t("raid.andSpares", { count: report.spares })}`
      : working;
  };

  const roleWord = (role: Role, words: string): string =>
    role === "other" ? words : t(`raidRole.${role}`);

  const busyWord = (what: BusyWhat): string => t(`raidAdd.busy.${what}`);

  const sizeText = (size: string): string => {
    const bytes = parseByteCount(size);
    return bytes === null ? "" : formatBytes(bytes);
  };

  return {
    levelWord,
    arrayName,
    arrayNameText,
    progressText,
    protectionText,
    protectionNow,
    stateReason,
    statusWord,
    disksText,
    roleWord,
    busyWord,
    sizeText,
  };
}
