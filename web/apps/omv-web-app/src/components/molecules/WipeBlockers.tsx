// SPDX-License-Identifier: GPL-3.0-or-later
// Why a disk cannot be wiped, in words (phase 5 disks design 3.1; owner, P1, P3, P5): each blocker on
// its own line in the page's order, with what to do. The only links are to the pages where the reader
// can remove what blocks the wipe (File systems, RAID management); none leads to a wipe that skips
// these checks (P3).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ExternalLink,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import type { FsRef, WipeBlocker } from "../../disks/diskUse.ts";
import { inBlockerOrder } from "../../disks/wipe.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

/** A file system's name: its label as text, else "ext4 on /dev/sdb1" with the device in code type. */
export function WipeFsName({ fs }: { fs: FsRef }) {
  if (fs.label !== "") {
    return <span dir="auto">{fs.label}</span>;
  }
  return (
    <Trans
      i18nKey="disks.use.fsOnDevice"
      values={{ type: fs.type }}
      components={{ device: <IdentifierText value={fs.device} /> }}
    />
  );
}

function FsSentence({
  i18nKey,
  fs,
}: {
  i18nKey: "wipe.blocked.fsInUse" | "wipe.blocked.fsSetUp";
  fs: FsRef;
}) {
  const { t } = useTranslation();
  // The name is a component, so a label stays text whatever it holds (UI-2).
  const [before, after] = t(i18nKey, { name: "\u0000" }).split("\u0000");
  return (
    <>
      {before}
      <WipeFsName fs={fs} />
      {after}
    </>
  );
}

function Line({ blocker }: { blocker: WipeBlocker }) {
  const { t } = useTranslation();
  const newTab = t("app.newTab");
  const fsLink = (
    <ExternalLink href={CLASSIC.fileSystems} newTabLabel={newTab}>
      {t("wipe.fsLink")}
    </ExternalLink>
  );
  switch (blocker.kind) {
    case "system":
      return <p>{t("wipe.blocked.system")}</p>;
    case "readOnly":
      return <p>{t("wipe.blocked.readOnly")}</p>;
    case "fsInUse":
      return (
        <>
          <p>
            <FsSentence i18nKey="wipe.blocked.fsInUse" fs={blocker.fs} />
            {blocker.used ? <> {t("disk.fact.useShared")}</> : null}
          </p>
          <p className="text-sm">
            {t("wipe.blocked.fsInUseDo")} {fsLink}
          </p>
        </>
      );
    case "fsSetUp":
      return (
        <>
          <p>
            <FsSentence i18nKey="wipe.blocked.fsSetUp" fs={blocker.fs} />
          </p>
          <p className="text-sm">
            {t("wipe.blocked.fsSetUpDo")} {fsLink}
          </p>
        </>
      );
    case "fsCreating":
      return <p>{t("wipe.blocked.fsCreating")}</p>;
    case "swap":
      return <p>{t("wipe.blocked.swap")}</p>;
    case "raid":
      return (
        <>
          <p>
            <Trans
              i18nKey="wipe.blocked.raid"
              components={{
                array: (
                  <IdentifierText
                    value={
                      blocker.array.name === ""
                        ? blocker.array.devicefile
                        : blocker.array.name
                    }
                  />
                ),
              }}
            />
          </p>
          <p className="text-sm">
            {t("wipe.blocked.raidDo")}{" "}
            <ExternalLink href={CLASSIC.raid} newTabLabel={newTab}>
              {t("wipe.raidLink")}
            </ExternalLink>
          </p>
        </>
      );
    case "wiping":
      return <p>{t("wipe.blocked.wiping")}</p>;
    case "unchecked":
      return <p>{t("wipe.blocked.unchecked")}</p>;
  }
}

export function WipeBlockers({
  blockers,
  error,
  onRetry,
  retrying = false,
  id,
}: {
  blockers: readonly WipeBlocker[];
  /** Why the inputs could not be read, for the "Could not check" line (UI-9: its message only). */
  error?: unknown;
  /** "Try again" for the "Could not check" line: re-reads the inputs. */
  onRetry?: () => void;
  retrying?: boolean;
  id?: string;
}) {
  const { t } = useTranslation();
  return (
    <ul id={id} data-slot="wipe-blockers" className="flex flex-col gap-3">
      {inBlockerOrder(blockers).map((blocker, i) => (
        <li
          key={`${blocker.kind}-${String(i)}`}
          className="flex max-w-prose flex-col gap-1"
        >
          <Line blocker={blocker} />
          {blocker.kind === "unchecked" ? (
            <>
              {isRpcError(error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.message}
                </ServerMessage>
              ) : null}
              {onRetry ? (
                <p>
                  <Button
                    variant="neutral"
                    size="sm"
                    loading={retrying}
                    onClick={retrying ? undefined : onRetry}
                  >
                    {t("common.tryAgain")}
                  </Button>
                </p>
              ) : null}
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
