// SPDX-License-Identifier: GPL-3.0-or-later
// "Share a folder with Linux and Unix computers" from the NFS page (phase 5 services design 1.4): the
// folder first (the shared folders by name, with their file system; a folder 0.10 refuses is listed
// unavailable with the reason after it), then the entry form of 2.3. On Save the dialog closes and
// focus returns to the button that opened it. When NFS is off, the form's last line says saving turns
// it on, and it does in the same save.
import type {
  NfsSettings,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@omv-webui/react-ui-components";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { folderRefusal, type FolderRefusal } from "../../services/nfsModel.ts";
import { SelfTestSelect } from "../molecules/SelfTestSelect.tsx";
import { NfsEntryForm } from "./NfsEntryForm.tsx";

const refusalKey = {
  nameSpace: "nfs.dialog.folderNameSpace",
  pathSpace: "nfs.dialog.folderSpace",
  notOk: "nfs.dialog.folderNotOk",
} as const satisfies Record<FolderRefusal, string>;

export function NfsShareDialog({
  open,
  onOpenChange,
  folders,
  settings,
  finalFocus,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: readonly SharedFolder[];
  settings: NfsSettings | undefined;
  finalFocus: RefObject<HTMLElement | null>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const options = folders.map((f) => {
    const refusal = folderRefusal(f, f.status === "OK");
    return {
      value: f.uuid,
      label: inertBidi(f.name),
      description:
        refusal === null
          ? inertBidi(f.description)
          : `${inertBidi(f.description)} ${t(refusalKey[refusal])}`.trim(),
      disabled: refusal !== null,
    };
  });
  const first = options.find((o) => !o.disabled)?.value ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const uuid = chosen ?? first;
  const folder = folders.find((f) => f.uuid === uuid);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setChosen(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent finalFocus={finalFocus}>
        <div className="flex min-w-0 flex-col gap-4">
          <DialogTitle>{t("nfs.dialog.title")}</DialogTitle>
          <NfsEntryForm
            folder={
              folder === undefined
                ? null
                : { uuid: folder.uuid, name: folder.name }
            }
            settings={settings}
            onSaved={() => {
              setChosen(null);
              onSaved();
            }}
            onCancel={() => {
              setChosen(null);
              onOpenChange(false);
            }}
          >
            <SelfTestSelect
              label={t("nfs.dialog.folder")}
              value={uuid ?? ""}
              options={options}
              disabled={first === null}
              onValueChange={setChosen}
            />
          </NfsEntryForm>
        </div>
      </DialogContent>
    </Dialog>
  );
}
