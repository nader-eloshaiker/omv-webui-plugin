// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's name (phase 5 design 1.2.1): "System drive" for the drive openmediavault runs from,
// a label as plain text in its own direction, or a device path in the mono face that breaks anywhere.
// Server text is rendered as text (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import type { FsName } from "../../dashboard/dashboard.ts";

export function FileSystemName({ name }: { name: FsName }) {
  const { t } = useTranslation();
  switch (name.kind) {
    case "systemDrive":
      return <>{t("dashboard.storage.systemDrive")}</>;
    case "label":
      return (
        <span dir="auto" className="break-words">
          {name.text}
        </span>
      );
    case "device":
      return <Identifier>{name.text}</Identifier>;
  }
}
