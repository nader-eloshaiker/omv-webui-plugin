// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's words as plain text (phase 5 file-systems design 0.1): its type ("EXT4"), and its
// name for a sentence, an accessible name or a document title ("media", "EXT4 on /dev/sdb1"). Server
// text is passed as a value, never parsed (UI-2).
import { useTranslation } from "react-i18next";
import { fsName, fsTypeKey, type FsName } from "../filesystems/fsModel.ts";

const DEVICE_TAG = "<device></device>";

export function useFsWords() {
  const { t } = useTranslation();
  const typeWord = (type: string): string => {
    const key = fsTypeKey(type);
    return key === null ? type : t(`fsType.${key}`);
  };
  const nameOf = (name: FsName): string =>
    name.kind === "label"
      ? name.text
      : t("fsName.onDevice", { type: typeWord(name.type) }).replace(
          DEVICE_TAG,
          name.device,
        );
  return {
    typeWord,
    nameOf,
    /** The name of a row from any of the file-system reads. */
    nameText: (row: Parameters<typeof fsName>[0]): string =>
      nameOf(fsName(row)),
  };
}
