// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's health from the session's check (phase 5 disks design 1.3, column 5): the status label and,
// for anything but OK, the reason (left out where the page already says it); "Not checked" before
// any check; "Not reported" for a disk the check did not list (it reports no health readings). The
// state is the server's `overallstatus` (D5).
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { StatusLabel } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

/** The reason sentence of a disk's state; null for OK. */
export function DiskReason({ overallstatus }: { overallstatus: string }) {
  const { t } = useTranslation();
  const state = diskState(overallstatus);
  if (state.reason === null) {
    return null;
  }
  if (state.reason === "other") {
    return (
      <Trans
        i18nKey="diskHealth.reason.other"
        components={{ code: <IdentifierText value={overallstatus} /> }}
      />
    );
  }
  return <>{t(`diskHealth.reason.${state.reason}`)}</>;
}

export function DiskHealthStatus({
  checked,
  reading,
  reason = true,
}: {
  /** Whether the session has a check result at all. */
  checked: boolean;
  /** This disk's row of the check, when it is in it. */
  reading: SmartDevice | undefined;
  /** Whether to say the reason under the label; off where the page already says it. */
  reason?: boolean;
}) {
  const { t } = useTranslation();
  if (!checked) {
    return (
      <span className="text-muted-foreground">{t("disks.notChecked")}</span>
    );
  }
  if (reading === undefined) {
    return (
      <span className="text-muted-foreground">{t("disks.notReported")}</span>
    );
  }
  const state = diskState(reading.overallstatus);
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusLabel status={state.status}>
        {t(`health.${state.status}`)}
      </StatusLabel>
      {!reason || state.reason === null ? null : (
        <span className="text-sm">
          <DiskReason overallstatus={reading.overallstatus} />
        </span>
      )}
    </span>
  );
}
