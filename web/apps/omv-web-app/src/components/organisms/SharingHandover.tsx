// SPDX-License-Identifier: GPL-3.0-or-later
// "Next: share a folder on it" (phase 5 file-systems design 6.8; owner, P4, Q4, Q6, Q9): until the
// shares domain is built, sharing is handed to the classic interface with the exact steps and the
// choices this interface would make: only the people given access (the 770 option), Public left at No,
// and guests only as a separate, explained choice. Every link is a fixed classic page (UI-3).
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { Card, ExternalLink } from "@omv-webui/react-ui-components";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { choiceText } from "../../filesystems/fsModel.ts";
import { useServicesOnce } from "../../hooks/useFsReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";

function Step({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: `/#/${string}`; label: string };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-1">
      <p className="font-semibold">{title}</p>
      {link === undefined ? null : (
        <p>
          <ExternalLink href={link.href} newTabLabel={t("app.newTab")}>
            {link.label}
          </ExternalLink>
        </p>
      )}
      {children}
    </li>
  );
}

export function SharingHandover({
  fs,
  headingLevel = 3,
}: {
  fs: ConfiguredFilesystem;
  headingLevel?: 2 | 3;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const services = useServicesOnce();
  const samba = services.data?.data.find((s) => s.name === "samba");
  // Shown unless the read says SMB/CIFS is on: an unread status is not taken for "on".
  const smbOff = samba?.enabled !== true;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex flex-col gap-3 p-4"
    >
      <Heading id={headingId} className="text-base font-semibold">
        {t("addStorage.handover.title")}
      </Heading>
      <ol className="flex list-decimal flex-col gap-3 ps-5 marker:font-semibold">
        <Step
          title={t("addStorage.handover.folder")}
          link={{
            href: CLASSIC.addSharedFolder,
            label: t("addStorage.handover.folderLink"),
          }}
        >
          <p className="max-w-prose">
            {t("addStorage.handover.folderBody", {
              choiceText: choiceText(fs),
            })}
          </p>
        </Step>
        <Step
          title={t("addStorage.handover.access")}
          link={{
            href: CLASSIC.sharedFolders,
            label: t("addStorage.handover.accessLink"),
          }}
        >
          <p className="max-w-prose">{t("addStorage.handover.accessBody")}</p>
        </Step>
        {smbOff ? (
          <Step
            title={t("addStorage.handover.smbOn")}
            link={{
              href: CLASSIC.smbSettings,
              label: t("addStorage.handover.smbOnLink"),
            }}
          >
            <p className="max-w-prose">{t("addStorage.handover.smbOnBody")}</p>
          </Step>
        ) : null}
        <Step
          title={t("addStorage.handover.share")}
          link={{
            href: CLASSIC.smbAddShare,
            label: t("addStorage.handover.shareLink"),
          }}
        >
          <p className="max-w-prose">{t("addStorage.handover.shareBody")}</p>
          <p className="max-w-prose">{t("addStorage.handover.guest")}</p>
        </Step>
        <Step title={t("addStorage.handover.apply")}>
          <p className="max-w-prose">{t("addStorage.handover.applyBody")}</p>
        </Step>
      </ol>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("addStorage.handover.access2")}
      </p>
    </Card>
  );
}
