// SPDX-License-Identifier: GPL-3.0-or-later
// The words of the drawing of the NAS, the welcome and the scan line, from the catalogue
// (dashboard.welcome, dashboard.drawn, dashboard.scan, dashboard.also).
import { useTranslation } from "react-i18next";
import type { NasFrontWords, ScanWords } from "../dashboard/nasFront.ts";

const NUMBER_WORDS = new Set(["2", "3", "4", "5", "6", "7", "8", "9", "10"]);

export function useNasFrontWords() {
  const { t } = useTranslation();
  /** A count in words up to ten, in lower case for the middle of a sentence, then in figures. */
  const word = (n: number) =>
    NUMBER_WORDS.has(String(n))
      ? t(`dashboard.answer.numbers.${String(n) as "2"}`).toLowerCase()
      : String(n);

  const front: NasFrontWords = {
    raid: t("dashboard.drawn.raid"),
    unused: t("dashboard.drawn.unused"),
    ready: t("dashboard.drawn.ready"),
    stick: (summary, holds) => (
      <>
        {[t("dashboard.drawn.board"), summary].filter(Boolean).join(", ")}
        {holds === undefined ? null : (
          <>
            {", "}
            <strong>{holds}</strong>
          </>
        )}
      </>
    ),
  };

  const scan: ScanWords = {
    disks: t("dashboard.scan.disks"),
    storage: t("dashboard.scan.storage"),
    sharing: t("dashboard.scan.sharing"),
    network: t("dashboard.scan.network"),
    health: (tone) => t(`health.${tone}`),
    notChecked: t("dashboard.scan.notChecked"),
    unread: t("dashboard.scan.unread"),
    reading: t("dashboard.scan.reading"),
    notSetUp: t("dashboard.scan.notSetUp"),
    notConnected: t("dashboard.map.notConnected"),
    diskCount: (count) => t("dashboard.scan.diskCount", { count }),
    disksAsleep: (disks, asleep) =>
      t("dashboard.scan.disksAsleep", { disks, asleep }),
    drivesAll: (count) => t("dashboard.scan.drivesAll", { count }),
    drivesSome: (name, value) =>
      t("dashboard.scan.drivesSome", {
        name,
        percent: t("dashboard.now.percent", { value }),
      }),
    drivesNone: t("dashboard.scan.drivesNone"),
    sharingOn: (folders, count) =>
      t("dashboard.scan.waysOn", {
        count,
        folders: t("dashboard.scan.folderCount", { count: folders }),
      }),
    sharingNone: t("dashboard.scan.sharingNone"),
    networkUp: (name, speed) =>
      speed === undefined
        ? name
        : t("dashboard.scan.networkUp", { name, speed }),
    goTo: (area) =>
      t("dashboard.scan.goTo", { part: t(`dashboard.scan.parts.${area}`) }),
    asleep: t("dashboard.map.asleep"),
  };

  const welcome = {
    title: (host: string) => t("dashboard.welcome.title", { host }),
    existingLead: (disks: number, drives: number, folders: number) =>
      t("dashboard.welcome.existingLead", {
        disks: t("dashboard.welcome.disks", {
          count: disks,
          word: word(disks),
        }),
        drives: t("dashboard.welcome.drives", {
          count: drives,
          word: word(drives),
        }),
        folders: t("dashboard.welcome.folders", {
          count: folders,
          word: word(folders),
        }),
      }),
    existingMore: (host: string) =>
      t("dashboard.welcome.existingMore", { host }),
    newLead: (disks: number, free: number) =>
      t("dashboard.welcome.newLead", {
        disks: t("dashboard.welcome.disks", {
          count: disks,
          word: word(disks),
        }),
        count: free,
        free: word(free),
      }),
    newMore: t("dashboard.welcome.newMore"),
    picture: (host: string) => t("dashboard.drawn.picture", { host }),
    mini: (host: string, checked: boolean) =>
      t("dashboard.drawn.mini", {
        host,
        state: checked
          ? t("dashboard.drawn.miniAfter")
          : t("dashboard.drawn.miniBefore"),
      }),
  };

  return { front, scan, welcome, word };
}
