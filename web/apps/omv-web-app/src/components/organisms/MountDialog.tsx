// SPDX-License-Identifier: GPL-3.0-or-later
// Mounting a file system found on a disk (phase 5 file-systems design 3). Not destructive: it writes a
// mount entry and marks modules pending, nothing on the disk changes, so it is a dialog with a form
// (Enter submits), not a confirmation. Saved, it closes, the lists are read again, the file system
// moves to the main table as "Set up", and the band offers Apply (D7: the save-then-apply loop).
import type {
  DetectedFilesystem,
  DiskDevice,
} from "@omv-webui/react-api-omv/generated";
import { useFileSystemMgmtSetMountPoint } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  InlineAlert,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LEVEL,
  tagsToSave,
  tagsTooLong,
} from "../../filesystems/fsModel.ts";
import { diskOf } from "../../filesystems/storageChoices.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { FsTypeView } from "../atoms/FsNameView.tsx";
import { LevelField, TagsField } from "../molecules/FsSettingFields.tsx";

export function MountDialog({
  fs,
  disks,
  onClose,
  onSaved,
  onRefresh,
  finalFocus,
}: {
  /** The file system to mount; the dialog is open while it is set. */
  fs: DetectedFilesystem | null;
  disks: readonly DiskDevice[] | undefined;
  onClose: () => void;
  /** Saved: the caller reads the lists again and announces it. */
  onSaved: (name: string) => void;
  onRefresh: () => void;
  finalFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const save = useFileSystemMgmtSetMountPoint();
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [tags, setTags] = useState("");
  const [tooLong, setTooLong] = useState(false);

  // Each opening starts afresh: the default level, no tags, no earlier failure.
  const [shown, setShown] = useState(fs);
  if (fs !== shown) {
    setShown(fs);
    if (fs !== null) {
      setLevel(DEFAULT_LEVEL);
      setTags("");
      setTooLong(false);
      save.reset();
    }
  }

  const saving = save.isPending;
  const name = fs === null ? "" : words.nameText(fs);
  const disk = fs === null ? undefined : diskOf(fs, disks);
  const diskSize = parseByteCount(disk?.size);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fs === null || saving) {
      return;
    }
    if (tagsTooLong(tags)) {
      setTooLong(true);
      return;
    }
    save.mutate(
      {
        data: {
          id: fs.devicefile,
          usagewarnthreshold: level,
          comment: tagsToSave(tags),
        },
      },
      { onSuccess: () => onSaved(name) },
    );
  };

  const failure = save.error;
  const exists =
    isRpcError(failure) && /mount point already exists/i.test(failure.message);

  return (
    <Dialog
      open={fs !== null}
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent finalFocus={finalFocus}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {t("fsMount.title", { name })}
            </DialogTitle>
            <DialogDescription>{t("fsMount.intro")}</DialogDescription>
          </div>
          {fs === null ? null : (
            <FactList>
              <FactListItem>
                <FactListLabel>{t("filesystem.fact.type")}</FactListLabel>
                <FactListValue>
                  <FsTypeView type={fs.type} />
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("filesystem.fact.on")}</FactListLabel>
                <FactListValue>
                  <Identifier>
                    {disk?.canonicaldevicefile ?? fs.parentdevicefile}
                  </Identifier>
                  {disk === undefined ? null : (
                    <span className="block text-sm" dir="auto">
                      {[
                        disk.model.trim(),
                        diskSize === null ? "" : formatBytes(diskSize),
                      ]
                        .filter((part) => part !== "")
                        .join(", ")}
                    </span>
                  )}
                </FactListValue>
              </FactListItem>
              {fs.label.trim() === "" ? null : (
                <FactListItem>
                  <FactListLabel>{t("fsMount.label")}</FactListLabel>
                  <FactListValue>
                    <span dir="auto">{fs.label}</span>
                  </FactListValue>
                </FactListItem>
              )}
            </FactList>
          )}
          {failure ? (
            <InlineAlert tone="critical" title={t("fsMount.failed")}>
              {isRpcError(failure) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {failure.message}
                </ServerMessage>
              ) : null}
              {exists ? (
                <p className="mt-2">
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    onClick={() => {
                      onRefresh();
                      onClose();
                    }}
                  >
                    {t("filesystems.refresh")}
                  </Button>
                </p>
              ) : null}
            </InlineAlert>
          ) : null}
          <LevelField value={level} onChange={setLevel} readOnly={saving} />
          <TagsField
            value={tags}
            onChange={(text) => {
              setTags(text);
              setTooLong(false);
            }}
            readOnly={saving}
            tooLong={tooLong}
          />
          <DialogFooter>
            <DialogClose
              disabled={saving}
              render={<Button type="button" variant="neutral" />}
            >
              {t("fsMount.cancel")}
            </DialogClose>
            <Button type="submit" loading={saving}>
              {saving ? t("common.saving") : t("fsMount.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
