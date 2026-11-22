// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's summary card (phase 5 shares design 2.3): its state, its file system (a link to
// that file system's page), where it is on it, its full path with a copy button, its network
// addresses when it is shared and Windows and Mac sharing is on, and its description, edited in place.
// The name is the title; why it cannot be changed is behind a disclosure. Server text as text (UI-2).
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import {
  Card,
  CardContent,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { inertBidi } from "../../format/isolate.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { displayPath, isWholeFs } from "../../sharedFolders/nameRules.ts";
import type { FolderState } from "../../sharedFolders/shareActions.ts";
import { FolderDescription } from "../molecules/FolderDescription.tsx";
import { FolderFsName } from "../molecules/FolderFsName.tsx";
import { FolderStateView } from "../molecules/FolderStateView.tsx";
import { ShareAddressList } from "../molecules/ShareAddressList.tsx";

export function SharedFolderSummary({
  folder,
  fs,
  state,
  hostname,
  shared,
  descriptionPending,
}: {
  folder: SharedFolder;
  fs: ConfiguredFilesystem | undefined;
  state: FolderState;
  hostname: string | undefined;
  /** Shared over SMB, its share on, and Windows and Mac sharing on: the addresses are shown. */
  shared: boolean;
  descriptionPending: boolean;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const free = fs === undefined ? null : parseByteCount(fs.available);
  const fullPath = folder.absdirpath ?? "";
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <FactList>
          <FactListItem>
            <FactListLabel>{t("sharedFolder.fact.state")}</FactListLabel>
            <FactListValue>
              <FolderStateView state={state} fs={fs} />
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("sharedFolder.fact.fs")}</FactListLabel>
            <FactListValue>
              {fs === undefined ? (
                <span className="text-muted-foreground">
                  {t("common.notAvailable")}
                </span>
              ) : (
                <span className="flex flex-col gap-0.5">
                  <span>
                    <FolderFsName fs={fs} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {free === null || free < 0
                      ? words.typeWord(fs.type)
                      : t("sharedFolder.fact.fsValue", {
                          type: words.typeWord(fs.type),
                          free: formatBytes(free),
                        })}
                  </span>
                </span>
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("sharedFolder.fact.path")}</FactListLabel>
            <FactListValue>
              {isWholeFs(folder.reldirpath) ? (
                t("sharedFolder.fact.wholeFs")
              ) : (
                <Identifier dir="auto" className="[overflow-wrap:anywhere]">
                  {inertBidi(displayPath(folder.reldirpath))}
                </Identifier>
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("sharedFolder.fact.fullPath")}</FactListLabel>
            <FactListValue>
              {fullPath === "" ? (
                <span className="text-muted-foreground">
                  {t("common.notAvailable")}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <Identifier dir="auto" className="[overflow-wrap:anywhere]">
                    {inertBidi(fullPath)}
                  </Identifier>
                  <CopyButton
                    text={fullPath}
                    label={t("sharedFolders.copyPath", {
                      name: inertBidi(folder.name),
                    })}
                    copiedLabel={t("common.copied")}
                    selectedLabel={t("common.copySelected")}
                    size="icon-sm"
                  />
                </span>
              )}
            </FactListValue>
          </FactListItem>
          {shared && hostname !== undefined ? (
            <FactListItem>
              <FactListLabel>{t("sharedFolder.fact.address")}</FactListLabel>
              <FactListValue>
                <ShareAddressList hostname={hostname} folder={folder.name} />
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t("sharedFolder.fact.addressHint", {
                    host: inertBidi(hostname),
                  })}
                </span>
              </FactListValue>
            </FactListItem>
          ) : null}
          <FactListItem>
            <FactListLabel>{t("sharedFolder.fact.description")}</FactListLabel>
            <FactListValue>
              <FolderDescription folder={folder} pending={descriptionPending} />
            </FactListValue>
          </FactListItem>
        </FactList>
        <Disclosure>
          <DisclosureTrigger>{t("sharedFolder.rename.why")}</DisclosureTrigger>
          <DisclosurePanel>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("sharedFolder.rename.body")}
            </p>
          </DisclosurePanel>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
