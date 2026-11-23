// SPDX-License-Identifier: GPL-3.0-or-later
// "Delete this shared folder", last on its page (phase 5 shares design 8.1, 8.2; 0.7, 0.9; P13, P15):
// two neutral buttons, "Remove, keep the files…" and "Delete with all its files…" (the destructive
// form is only on the dialog's confirm button), each unavailable (aria-disabled, still focusable) with
// its blockers in words beside it, from the page's reads, failing closed. Pressing one opens the dialog,
// which reads ShareMgmt.getList, SMB.getShareList, FileSystemMgmt.getList and the pending modules again
// before it shows anything (8.2), and the home-folder setting (phase 5 users design 13.1): the folder
// that holds them is refused with "Turn home folders off first.". The folder's NFS entries, the rsync
// server folder that offers it and the copy jobs that use it refuse it too, each named with what to do
// (phase 5 services design 2.7), and the check reads those three lists again.
import type {
  ConfiguredFilesystem,
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { Button } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { holdsHomeFolders } from "../../homeFolders/homeModel.ts";
import { useGroupsRereads } from "../../hooks/useGroupsApi.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import type { ServiceReads } from "../../services/folderUses.ts";
import {
  isShareDeleting,
  shareDeleteOf,
  shareDeletes,
  type DeleteWay,
  type ShareDeleteWords,
} from "../../sharedFolders/deleteRun.ts";
import {
  deleteBlockers,
  folderChanged,
  folderFs,
  type ListRead,
} from "../../sharedFolders/shareActions.ts";
import { runningOn, sharesSession } from "../../sharedFolders/sharesSession.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { ShareDeleteBlockers } from "./ShareDeleteBlockers.tsx";
import {
  ShareDeleteDialog,
  type ShareDeleteCheck,
  type ShareDeleteOutcome,
} from "./ShareDeleteDialog.tsx";

const settle = <T,>(read: Promise<T[]>): Promise<ListRead<T>> =>
  read.then(
    (data) => ({ data, failed: false }),
    (error: unknown) => ({ data: undefined, failed: true, error }),
  );

export function ShareDeleteSection({
  folder,
  folders,
  shares,
  fileSystems,
  pending,
  homeFolders = false,
  services,
  recheckServices,
  onRetry,
  onStopSharing,
  onDone,
}: {
  folder: SharedFolder;
  folders: ListRead<SharedFolder>;
  shares: ListRead<SmbShareRow>;
  fileSystems: ListRead<ConfiguredFilesystem>;
  pending: readonly string[];
  /** It holds the home folders now, as the page read the setting. */
  homeFolders?: boolean;
  /** The NFS entries, rsync server folders and copy jobs, as the page read them (2.7). */
  services?: ServiceReads;
  /** Reads those three again, for the check before the dialog. */
  recheckServices?: () => Promise<ServiceReads>;
  onRetry: () => void;
  /** Opens "Stop sharing…" in the section above (4.5). */
  onStopSharing: () => void;
  onDone: (
    outcome: ShareDeleteOutcome,
    way: DeleteWay,
    words: ShareDeleteWords,
  ) => void;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const rereads = useGroupsRereads();
  useMemoryStore(shareDeletes);
  useMemoryStore(sharesSession);
  const keepRef = useRef<HTMLButtonElement>(null);
  const filesRef = useRef<HTMLButtonElement>(null);
  const keepId = useId();
  const filesId = useId();
  const [open, setOpen] = useState(false);
  const [way, setWay] = useState<DeleteWay>("keep");
  const run = shareDeleteOf(folder.uuid);
  const deleting = isShareDeleting(run) || run !== undefined;
  const running = runningOn(folder.uuid);

  const blockers = deleteBlockers({
    folder,
    folders,
    shares,
    fileSystems,
    running: deleting ? null : running,
    pending,
    homeFolders,
    services,
  });
  // The files-only blockers: the shared ones are said once, beside the first button.
  const filesOnly = blockers.files.filter(
    (b) => !blockers.keep.some((k) => k.kind === b.kind),
  );
  const keepBlocked = !deleting && blockers.keep.length > 0;
  const filesBlocked = !deleting && blockers.files.length > 0;

  const check = async (forWay: DeleteWay): Promise<ShareDeleteCheck> => {
    const [list, sharesNow, fsNow, pendingNow, homeNow, servicesNow] =
      await Promise.all([
        settle(api.folders()),
        settle(api.shares()),
        settle(api.fileSystems()),
        api.pending().then(
          (p) => p,
          () => null,
        ),
        // Not read: `_used` still refuses the folder that holds them (0.7's "other").
        rereads.homeSettings().catch(() => undefined),
        recheckServices === undefined
          ? Promise.resolve(undefined)
          : recheckServices(),
      ]);
    if (list.failed || list.data === undefined) {
      return {
        kind: "refused",
        body: (
          <ShareDeleteBlockers
            blockers={[{ kind: "unread", error: list.error }]}
            folder={folder}
          />
        ),
      };
    }
    const now = list.data.find((f) => f.uuid === folder.uuid);
    if (now === undefined) {
      return { kind: "gone" };
    }
    if (folderChanged(folder, now)) {
      return {
        kind: "refused",
        body: (
          <Trans
            i18nKey="sharedFolder.changedElsewhere"
            components={{ folder: <FolderNameText value={folder.name} /> }}
          />
        ),
      };
    }
    const found = deleteBlockers({
      folder: now,
      folders: list,
      shares: sharesNow,
      fileSystems: fsNow,
      running: runningOn(folder.uuid),
      pending: pendingNow ?? [],
      homeFolders: holdsHomeFolders(homeNow, folder.uuid),
      services: servicesNow,
    });
    const refusing = forWay === "keep" ? found.keep : found.files;
    if (refusing.length > 0) {
      return {
        kind: "refused",
        body: (
          <ShareDeleteBlockers
            blockers={refusing}
            folder={now}
            onStopSharing={() => {
              setOpen(false);
              onStopSharing();
            }}
          />
        ),
      };
    }
    if (pendingNow === null) {
      return {
        kind: "refused",
        body: t("shareDelete.blocked.unread"),
      };
    }
    if (pendingNow.length > 0) {
      return { kind: "preflight", modules: pendingNow };
    }
    return {
      kind: "confirm",
      folder: now,
      fs: fsNow.data === undefined ? undefined : folderFs(now, fsNow.data),
    };
  };

  const openWith = (next: DeleteWay) => {
    setWay(next);
    setOpen(true);
  };

  return (
    <section
      aria-labelledby="folder-delete"
      className="mt-6 flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id="folder-delete" className="text-lg font-semibold">
        {t("shareDelete.title")}
      </h2>
      <p className="max-w-prose text-sm">{t("shareDelete.intro")}</p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <Button
            ref={keepRef}
            variant="neutral"
            disabled={keepBlocked}
            focusableWhenDisabled
            aria-describedby={keepBlocked ? keepId : undefined}
            onClick={
              keepBlocked ? undefined : () => openWith(run?.way ?? "keep")
            }
          >
            {t("shareDelete.keep.open")}
          </Button>
          {keepBlocked ? (
            <div id={keepId} className="text-sm">
              <ShareDeleteBlockers
                blockers={blockers.keep}
                folder={folder}
                onRetry={onRetry}
                onStopSharing={onStopSharing}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button
            ref={filesRef}
            variant="neutral"
            disabled={filesBlocked}
            focusableWhenDisabled
            aria-describedby={
              filesBlocked
                ? [
                    keepBlocked ? keepId : null,
                    filesOnly.length > 0 ? filesId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                : undefined
            }
            onClick={
              filesBlocked ? undefined : () => openWith(run?.way ?? "files")
            }
          >
            {t("shareDelete.files.open")}
          </Button>
          {filesBlocked && filesOnly.length > 0 ? (
            <div id={filesId} className="text-sm">
              <ShareDeleteBlockers
                blockers={filesOnly}
                folder={folder}
                onRetry={onRetry}
              />
            </div>
          ) : null}
        </div>
      </div>
      <ShareDeleteDialog
        open={open}
        onClose={() => setOpen(false)}
        uuid={folder.uuid}
        name={folder.name}
        way={way}
        onWayChange={setWay}
        check={check}
        openerRef={way === "keep" ? keepRef : filesRef}
        onDone={(outcome, doneWay, words) => {
          setOpen(false);
          onDone(outcome, doneWay, words);
        }}
      />
    </section>
  );
}
