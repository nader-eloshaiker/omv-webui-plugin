// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's name as plain words, for a sentence in the attention list: "System drive", its
// label, or its device path (phase 5 design 1.2.1).
import { useTranslation } from "react-i18next";
import type { FsName } from "../dashboard/dashboard.ts";

export function useFileSystemNameText() {
  const { t } = useTranslation();
  return (name: FsName): string =>
    name.kind === "systemDrive"
      ? t("dashboard.storage.systemDrive")
      : name.text;
}
