// SPDX-License-Identifier: GPL-3.0-or-later
// Why a disk cannot be wiped, in words (phase 5 disks design 3.1; owner, P1, P3, P5): each blocker on
// its own line in the page's order, with what to do. The only links are to the pages where the reader
// can remove what blocks the wipe (a file system's page, an array's page, the classic ZFS pages); none
// leads to a wipe that skips these checks (P3).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ExternalLink,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import type { FsRef, WipeBlocker } from "../../disks/diskUse.ts";
import { inBlockerOrder } from "../../disks/wipe.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { arrayAddress } from "../../raid/raidModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

/** A file system's name: its label as text, else "EXT4 on /dev/sdb1" with the device in code type. */
export function WipeFsName({ fs }: { fs: FsRef }) {
  const { typeWord } = useFsWords();
  if (fs.label !== "") {
    return <span dir="auto">{fs.label}</span>;
  }
  return (
    <Trans
      i18nKey="disks.use.fsOnDevice"
      values={{ type: typeWord(fs.type) }}
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
  const words = useFsWords();
  const newTab = t("app.newTab");
  // The file system's page, where its unmount or removal and their own refusals are (file-systems
  // design 9); the classic list only for one this interface has no page for.
  const fsLink = (fs: FsRef) =>
    fs.address == null ? (
      <ExternalLink href={CLASSIC.fileSystems} newTabLabel={newTab}>
        {t("wipe.fsLink")}
      </ExternalLink>
    ) : (
      <Link
        to="/storage/filesystems/$fs"
        params={{ fs: fs.address }}
        className={routerLinkClass}
      >
        {t("wipe.fsOpen", {
          name: words.nameText({
            label: fs.label,
            type: fs.type,
            canonicaldevicefile: fs.device,
            devicefile: fs.device,
          }),
        })}
      </Link>
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
            {t("wipe.blocked.fsInUseDo")} {fsLink(blocker.fs)}
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
            {t("wipe.blocked.fsSetUpDo")} {fsLink(blocker.fs)}
          </p>
        </>
      );
    case "fsCreating":
      return <p>{t("wipe.blocked.fsCreating")}</p>;
    case "swap":
      return <p>{t("wipe.blocked.swap")}</p>;
    case "raid": {
      // The array's page, where taking a disk out and deleting the array have their own refusals
      // (RAID design 9.2). Named by its device, never mdadm's "host:name".
      const address = arrayAddress(blocker.array);
      return (
        <>
          <p>
            <Trans
              i18nKey="wipe.blocked.raid"
              components={{
                array: <IdentifierText value={blocker.array.devicefile} />,
              }}
            />
          </p>
          <p className="text-sm">
            {t("wipe.blocked.raidDo")}{" "}
            {address === null ? (
              <ExternalLink href={CLASSIC.raid} newTabLabel={newTab}>
                {t("raid.classicLink")}
              </ExternalLink>
            ) : (
              <Link
                to="/storage/md/$array"
                params={{ array: address }}
                className={routerLinkClass}
              >
                {t("wipe.raidLink", { array: blocker.array.devicefile })}
              </Link>
            )}
          </p>
        </>
      );
    }
    case "zfs":
      // The pool's page, where replacing the disk or deleting the pool is offered (ZFS design 10.2).
      return (
        <>
          <p>{t("wipe.blocked.zfs", { pool: blocker.pool })}</p>
          {isPoolAddress(blocker.pool) ? (
            <p className="text-sm">
              {t("wipe.blocked.zfsDoPool")}{" "}
              <Link
                to="/storage/zfs/pools/$pool"
                params={{ pool: blocker.pool }}
                className={routerLinkClass}
              >
                {t("wipe.zfsPoolLink", { pool: blocker.pool })}
              </Link>
            </p>
          ) : (
            <p className="text-sm">
              {t("wipe.blocked.zfsDo")}{" "}
              <ExternalLink href={CLASSIC.zfs} newTabLabel={newTab}>
                {t("wipe.zfsLink")}
              </ExternalLink>
            </p>
          )}
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
