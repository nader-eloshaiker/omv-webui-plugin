// SPDX-License-Identifier: GPL-3.0-or-later
// "Next: share a folder on it" (phase 5 shares design 6.7, 9.1; file-systems design 6.8, D20): one
// card with one sentence and one button that opens "Add a shared folder" with this file system chosen.
// The file system is handed over in memory (sharesSession), never in the address (UI-4); the flow
// checks it again and simply does not choose it when it is no longer offered.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { buttonClass, Card } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { Trans, useTranslation } from "react-i18next";
import { handOverFs } from "../../sharedFolders/sharesSession.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { FsNameView } from "../atoms/FsNameView.tsx";

export function SharingHandover({
  fs,
  headingLevel = 3,
}: {
  fs: ConfiguredFilesystem;
  headingLevel?: 2 | 3;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex flex-col gap-3 p-4"
    >
      <Heading id={headingId} className="text-base font-semibold">
        {t("addStorage.handover.title")}
      </Heading>
      <p className="max-w-prose">
        <Trans
          i18nKey="addStorage.handover.body"
          components={{ fs: <FsNameView name={shownFsName(fs)} /> }}
        />
      </p>
      <p>
        <Link
          to="/storage/shared-folders/add"
          className={buttonClass({ variant: "primary" })}
          onClick={() => handOverFs(fs.devicefile)}
        >
          {t("addStorage.handover.button")}
        </Link>
      </p>
    </Card>
  );
}
