// SPDX-License-Identifier: GPL-3.0-or-later
// What a disk is used for, one line per use, in reading order (phase 5 disks design 1.3.1). A file
// system's name is its label as text, else "ext4 on /dev/sdb1" with the device in the mono face. Values
// from the server are rendered as text: they are placed into the sentence as elements, never passed
// through markup parsing (UI-2).
import { Identifier, Skeleton } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { fsName, SLOT, splitSlots } from "../../disks/disksList.ts";
import type { DiskUse, FsRef } from "../../disks/diskUse.ts";
import { useFormat } from "../../format/useFormat.ts";

const DEVICE_TAG = "<device></device>";
const ARRAY_TAG = "<array></array>";

/** A sentence with its slots filled by elements. */
function Filled({
  sentence,
  slots,
}: {
  sentence: string;
  slots: Readonly<Record<string, ReactNode>>;
}) {
  return (
    <>
      {splitSlots(sentence, Object.keys(slots)).map((part, i) =>
        "text" in part ? (
          <span key={`t${String(i)}`}>{part.text}</span>
        ) : (
          <span key={`s${String(i)}`}>{slots[part.slot]}</span>
        ),
      )}
    </>
  );
}

/** "ext4 on /dev/sdb1". */
function FsOnDevice({ type, device }: { type: string; device: string }) {
  const { t } = useTranslation();
  return (
    <Filled
      sentence={t("disks.use.fsOnDevice", { type: SLOT })}
      slots={{
        [SLOT]: <span dir="auto">{type}</span>,
        [DEVICE_TAG]: <Identifier>{device}</Identifier>,
      }}
    />
  );
}

type FsKey = "disks.use.fsInUse" | "disks.use.fsSetUp" | "disks.use.fsUnused";

/** A use sentence naming a file system: its label as text, else its type and device. */
export function FsSentence({ i18nKey, fs }: { i18nKey: FsKey; fs: FsRef }) {
  const { t } = useTranslation();
  const name = fsName(fs);
  if (name.kind === "label") {
    return (
      <Filled
        sentence={t(i18nKey, { name: SLOT })}
        slots={{ [SLOT]: <span dir="auto">{name.label}</span> }}
      />
    );
  }
  return (
    <Filled
      sentence={t(i18nKey, { name: SLOT })}
      slots={{ [SLOT]: <FsOnDevice type={name.type} device={name.device} /> }}
    />
  );
}

/** One use in words. */
export function DiskUseWords({ use }: { use: DiskUse }) {
  const { t } = useTranslation();
  const format = useFormat();
  switch (use.kind) {
    case "system":
      return <>{t("disks.use.system")}</>;
    case "fsInUse":
      return <FsSentence i18nKey="disks.use.fsInUse" fs={use.fs} />;
    case "fsSetUp":
      return <FsSentence i18nKey="disks.use.fsSetUp" fs={use.fs} />;
    case "fsUnused":
      return <FsSentence i18nKey="disks.use.fsUnused" fs={use.fs} />;
    case "fsCreating":
      return <>{t("disks.use.fsCreating")}</>;
    case "swap":
      return <>{t("disks.use.swap")}</>;
    case "raid":
      return (
        <Filled
          sentence={t("disks.use.raid")}
          slots={{
            [ARRAY_TAG]: (
              <Identifier>
                {use.array.name === "" ? use.array.devicefile : use.array.name}
              </Identifier>
            ),
          }}
        />
      );
    case "wiping":
      return <>{t("disks.use.wiping")}</>;
    case "wiped":
      return <>{t("disks.use.wiped", { time: format.clock(use.at) })}</>;
    case "none":
      return <>{t("disks.use.none")}</>;
    case "unknown":
      return (
        <span className="text-muted-foreground">{t("disks.use.unknown")}</span>
      );
  }
}

/** Every use of a disk, one per line; a skeleton while the checks are still being read. */
export function DisksUseLines({
  uses,
  loading = false,
}: {
  uses: readonly DiskUse[] | undefined;
  loading?: boolean;
}) {
  if (loading || uses === undefined) {
    return <Skeleton className="w-40" />;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {uses.map((use, i) => (
        <li key={`${use.kind}-${String(i)}`}>
          <DiskUseWords use={use} />
        </li>
      ))}
    </ul>
  );
}
