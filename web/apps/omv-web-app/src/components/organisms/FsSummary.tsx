// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's summary card (phase 5 file-systems design 2.3): its state, how full it is, its
// warning level and tags, its type, the disks it is on, its device name and its folder on the NAS, and
// behind a disclosure the names a support forum asks for. A missing file system shows only what can be
// known without its disk (2.3.1). Everything from the server is text.
import type {
  ConfiguredFilesystem,
  DiskDevice,
} from "@omv-webui/react-api-omv/generated";
import {
  Card,
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fsUsage,
  splitTags,
  type FsMountState,
} from "../../filesystems/fsModel.ts";
import { FsTypeView } from "../atoms/FsNameView.tsx";
import { FsOnDisks } from "../molecules/FsOnDisks.tsx";
import { FsStateView, FsUsageView } from "../molecules/FsStatus.tsx";

function OtherNames({ fs }: { fs: ConfiguredFilesystem }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const links = fs.devlinks.filter((l) => l !== "");
  const options = (fs.mountopts ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureTrigger>
        {open ? t("filesystem.names.hide") : t("filesystem.names.show")}
      </DisclosureTrigger>
      <DisclosurePanel>
        <FactList>
          {fs.uuid === "" ? null : (
            <FactListItem>
              <FactListLabel>{t("filesystem.names.uuid")}</FactListLabel>
              <FactListValue variant="identifier">{fs.uuid}</FactListValue>
            </FactListItem>
          )}
          {fs.devicefile === "" ? null : (
            <FactListItem>
              <FactListLabel>{t("filesystem.names.stable")}</FactListLabel>
              <FactListValue variant="identifier">
                {fs.devicefile}
              </FactListValue>
            </FactListItem>
          )}
          {links.length > 0 ? (
            <FactListItem>
              <FactListLabel>{t("filesystem.names.links")}</FactListLabel>
              <FactListValue variant="identifier">
                <ul>
                  {links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </FactListValue>
            </FactListItem>
          ) : null}
          {options.length > 0 ? (
            <FactListItem>
              <FactListLabel>{t("filesystem.names.options")}</FactListLabel>
              <FactListValue variant="identifier">
                <ul>
                  {options.map((option) => (
                    <li key={option}>{option}</li>
                  ))}
                </ul>
              </FactListValue>
            </FactListItem>
          ) : null}
        </FactList>
      </DisclosurePanel>
    </Disclosure>
  );
}

export function FsSummary({
  fs,
  state,
  name,
  disks,
}: {
  fs: ConfiguredFilesystem;
  state: FsMountState;
  /** The file system's name, which names the meter. */
  name: string;
  disks: readonly DiskDevice[] | undefined;
}) {
  const { t } = useTranslation();
  const missing = state === "missing";
  const level = fs.usagewarnthreshold ?? 0;
  const tags = splitTags(fs.comment);
  return (
    <Card className="flex flex-col gap-4 p-4">
      <FactList className="lg:grid-cols-2">
        <FactListItem>
          <FactListLabel>{t("filesystem.fact.state")}</FactListLabel>
          <FactListValue>
            <FsStateView state={state} />
          </FactListValue>
        </FactListItem>
        {missing ? null : (
          <FactListItem>
            <FactListLabel>{t("filesystem.fact.usage")}</FactListLabel>
            <FactListValue>
              <FsUsageView
                row={fs}
                usage={fsUsage(fs)}
                label={name}
                variant="default"
              />
            </FactListValue>
          </FactListItem>
        )}
        <FactListItem>
          <FactListLabel>{t("filesystem.fact.level")}</FactListLabel>
          <FactListValue>
            {level > 0 ? (
              `${String(level)}%`
            ) : (
              <>
                <span className="block">{t("filesystem.fact.levelOff")}</span>
                <span className="block text-sm text-muted-foreground">
                  {t("filesystem.fact.levelOffHint")}
                </span>
              </>
            )}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("filesystem.fact.tags")}</FactListLabel>
          {tags.length === 0 ? (
            <FactListValue variant="missing">{t("common.none")}</FactListValue>
          ) : (
            <FactListValue>
              <span dir="auto" className="break-words">
                {tags.join(", ")}
              </span>
            </FactListValue>
          )}
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("filesystem.fact.type")}</FactListLabel>
          <FactListValue>
            <FsTypeView type={fs.type} />
          </FactListValue>
        </FactListItem>
        {missing ? (
          <FactListItem>
            <FactListLabel>{t("filesystem.names.stable")}</FactListLabel>
            <FactListValue variant="identifier">{fs.devicefile}</FactListValue>
          </FactListItem>
        ) : (
          <>
            <FactListItem>
              <FactListLabel>{t("filesystem.fact.on")}</FactListLabel>
              <FactListValue>
                <FsOnDisks fs={fs} disks={disks} perLine />
              </FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>{t("filesystem.fact.device")}</FactListLabel>
              {fs.canonicaldevicefile === "" ? (
                <FactListValue variant="missing">
                  {t("filesystem.fact.notConnected")}
                </FactListValue>
              ) : (
                <FactListValue variant="identifier">
                  {fs.canonicaldevicefile}
                </FactListValue>
              )}
            </FactListItem>
          </>
        )}
        <FactListItem>
          <FactListLabel>{t("filesystem.fact.folder")}</FactListLabel>
          <FactListValue>
            <span className="flex flex-wrap items-center gap-2">
              <Identifier>{fs.mountpoint}</Identifier>
              {fs.mountpoint === "" ? null : (
                <CopyButton
                  text={fs.mountpoint}
                  label={t("filesystem.fact.copyFolder")}
                  copiedLabel={t("common.copied")}
                  selectedLabel={t("common.copySelected")}
                  size="icon-sm"
                />
              )}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {t("filesystem.fact.folderHint")}
            </span>
          </FactListValue>
        </FactListItem>
      </FactList>
      {missing ? null : <OtherNames fs={fs} />}
    </Card>
  );
}
