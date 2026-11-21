// SPDX-License-Identifier: GPL-3.0-or-later
// The roll-up of a disk-health check (phase 5 monitoring design 1.3.4; disks design 1.4): the worst
// state of the disks and how many share it, in words.
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { rollUp } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { diskState } from "../dashboard/dashboard.ts";

/** "1 of 5 disks: Critical", or "5 disks: OK", with the worst state; null for no disks. */
export function useDiskRollUp() {
  const { t } = useTranslation();
  return (disks: readonly SmartDevice[]) => {
    const statuses = disks.map((d) => diskState(d.overallstatus).status);
    const summary = rollUp(statuses);
    const status = statuses.find((s) => s === summary.status);
    if (status === undefined) {
      return null;
    }
    const text =
      status === "ok"
        ? t("diskCheck.allOk", { count: summary.total })
        : t("diskCheck.rollUp", {
            count: summary.count,
            total: summary.total,
            status: t(`health.${status}`),
          });
    return { status, text };
  };
}
