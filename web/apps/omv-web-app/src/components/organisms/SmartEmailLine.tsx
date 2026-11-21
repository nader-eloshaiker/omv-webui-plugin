// SPDX-License-Identifier: GPL-3.0-or-later
// How the NAS tells the reader about a failing disk (phase 5 disks design 4.4, the Email row; 7.3 E):
// whether email is set up, with the classic links to set it up and to the notification events. Email
// stays in the classic interface (D10). The address is the reply's, rendered as text.
import type { EmailNotificationSettings } from "@omv-webui/react-api-omv/generated";
import { ExternalLink, Skeleton } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { emailSetUp } from "../../disks/smartSettingsForm.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { Slotted } from "../atoms/Slotted.tsx";

export interface SmartEmailLineProps {
  /** EmailNotification.get's reply, once read. */
  email: EmailNotificationSettings | undefined;
  /** The read failed: say so, and keep the classic link. */
  failed: boolean;
}

export function SmartEmailLine({ email, failed }: SmartEmailLineProps) {
  const { t } = useTranslation();
  const newTab = t("app.newTab");
  const emailLink = (
    <ExternalLink href={CLASSIC.notifications} newTabLabel={newTab}>
      {t("smart.overview.emailLink")}
    </ExternalLink>
  );
  if (failed) {
    return (
      <div className="flex flex-col gap-1">
        <p>{t("smart.overview.emailFailed")}</p>
        <p>{emailLink}</p>
      </div>
    );
  }
  if (email === undefined) {
    return <Skeleton className="w-64" />;
  }
  return (
    <div className="flex flex-col gap-1">
      <p>
        {emailSetUp(email) ? (
          <Slotted
            sentence={(tokens) => t("smart.overview.emailOn", tokens)}
            values={{ address: email.primaryemail.trim() }}
          />
        ) : (
          t("smart.overview.emailOff")
        )}
      </p>
      <p>{emailLink}</p>
      <p className="text-sm text-muted-foreground">
        {t("smart.overview.eventsNote")}{" "}
        <ExternalLink href={CLASSIC.notificationEvents} newTabLabel={newTab}>
          {t("smart.overview.eventsLink")}
        </ExternalLink>
      </p>
    </div>
  );
}
