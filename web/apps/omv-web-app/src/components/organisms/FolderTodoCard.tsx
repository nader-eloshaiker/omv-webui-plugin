// SPDX-License-Identifier: GPL-3.0-or-later
// "What to do now" on a shared folder's page (phase 5 shares design 2.4): one card for the first case
// that applies (shareActions.folderTodo), with its plain sentence and the one or two things to do.
// Repairing where it points (section 7) is offered only for a folder that cannot be reached; a file
// system that is not mounted is mended on its own page. Names are isolated in sentences (0.2).
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { Ref } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { fsPage } from "../../sharedFolders/folderPage.ts";
import { displayPath, isWholeFs } from "../../sharedFolders/nameRules.ts";
import type { FolderTodo } from "../../sharedFolders/shareActions.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { FolderFsName } from "../molecules/FolderFsName.tsx";

export function FolderTodoCard({
  todo,
  folder,
  fs,
  onRepoint,
  repointRef,
}: {
  todo: FolderTodo;
  folder: SharedFolder;
  fs: ConfiguredFilesystem | undefined;
  /** Opens "Point it somewhere else" (section 7). */
  onRepoint: () => void;
  repointRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const slots = {
    folder: <FolderNameText value={folder.name} />,
    fs: <FsNameSlot fs={fs} fallback={folder.device} />,
    path: isWholeFs(folder.reldirpath) ? (
      <span>{t("sharedFolder.fact.wholeFs")}</span>
    ) : (
      <IdentifierText value={inertBidi(displayPath(folder.reldirpath))} />
    ),
  };
  const repoint = (
    <Button ref={repointRef} variant="neutral" onClick={onRepoint}>
      {t("sharedFolder.todo.repoint")}
    </Button>
  );
  const fsListLink = (
    <Link to="/storage/filesystems" className={routerLinkClass}>
      {t("sharedFolder.todo.openFsList")}
    </Link>
  );

  let title: string;
  let body;
  let actions = null;
  switch (todo) {
    case "fsGone":
      title = t("sharedFolder.todo.fsGone.title");
      body = (
        <Trans i18nKey="sharedFolder.todo.fsGone.body" components={slots} />
      );
      actions = (
        <>
          {repoint}
          {fsListLink}
        </>
      );
      break;
    case "notMounted":
      title = t("sharedFolder.todo.notMounted.title");
      body = (
        <Trans i18nKey="sharedFolder.todo.notMounted.body" components={slots} />
      );
      actions =
        fs !== undefined && fsPage(fs) !== null ? (
          <FolderFsName fs={fs}>
            {t("sharedFolder.todo.openFs", {
              fs: words.nameOf(shownFsName(fs)),
            })}
          </FolderFsName>
        ) : (
          fsListLink
        );
      break;
    case "missing":
      title = t("sharedFolder.todo.missing.title");
      body = (
        <Trans i18nKey="sharedFolder.todo.missing.body" components={slots} />
      );
      actions = repoint;
      break;
    case "notDir":
      title = t("sharedFolder.todo.notDir.title");
      body = (
        <Trans i18nKey="sharedFolder.todo.notDir.body" components={slots} />
      );
      actions = repoint;
      break;
    case "nobody":
      title = t("sharedFolder.todo.nobody.title");
      body = t("sharedFolder.todo.nobody.body");
      break;
    case "smbOff":
      title = t("sharedFolder.todo.smbOff.title");
      body = t("sharedFolder.todo.smbOff.body");
      actions = (
        <Link to="/services/smb" className={routerLinkClass}>
          {t("sharedFolders.smbOffLink")}
        </Link>
      );
      break;
    case "smbDown":
      title = t("sharedFolder.todo.smbDown.title");
      body = t("smb.state.down");
      actions = (
        <Link to="/diagnostics/services/smb" className={routerLinkClass}>
          {t("smb.state.downLink")}
        </Link>
      );
      break;
  }

  return (
    <Card render={<section aria-labelledby="folder-todo" />}>
      <CardHeader>
        <CardTitle level={3} id="folder-todo">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="gap-3 pt-0">
        <p className="max-w-prose">{body}</p>
        {actions === null ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
