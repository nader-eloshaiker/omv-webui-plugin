// SPDX-License-Identifier: GPL-3.0-or-later
// How the NAS tells the owner about a failing disk (phase 5 disks design 4.4, 7.3 E): whether email is
// set up, with the classic links to the email settings and the notification events. Email stays in the
// classic interface for this slice (D10); the events setting is mentioned, not read.
import type { EmailNotificationSettings } from "@omv-webui/react-api-omv/generated";
import { ExternalLink } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { emailConfigured } from "../../disks/setupPlan.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { Slotted } from "../atoms/Slotted.tsx";

export function SetUpEmailLine({
  email,
  failed,
  laterNote = false,
}: {
  email: EmailNotificationSettings | undefined;
  /** EmailNotification.get failed. */
  failed: boolean;
  /** Add the "set up email afterwards" sentence when email is not set up (Flow D). */
  laterNote?: boolean;
}) {
  const { t } = useTranslation();
  const on = emailConfigured(email);
  return (
    <div className="flex flex-col gap-1">
      <p>
        {failed ? (
          t("smart.overview.emailFailed")
        ) : on && email ? (
          <Slotted
            sentence={(tokens) => t("smart.overview.emailOn", tokens)}
            values={{ address: email.primaryemail }}
          />
        ) : (
          t("smart.overview.emailOff")
        )}
      </p>
      {!failed && !on && laterNote ? (
        <p className="text-sm">{t("smart.setup.emailLater")}</p>
      ) : null}
      <p>
        <ExternalLink
          href={CLASSIC.notifications}
          newTabLabel={t("app.newTab")}
        >
          {t("smart.overview.emailLink")}
        </ExternalLink>
      </p>
      <p className="text-sm text-muted-foreground">
        {t("smart.overview.eventsNote")}{" "}
        <ExternalLink
          href={CLASSIC.notificationEvents}
          newTabLabel={t("app.newTab")}
        >
          {t("smart.overview.eventsLink")}
        </ExternalLink>
      </p>
    </div>
  );
}
