// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's scheduled self-tests (phase 5 disks design 2.6): the Self-tests page's table for this disk
// only, without its Disk column, with the same row actions and dialogs, and "Add a self-test" with
// this disk chosen.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { PageSection } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { SelfTestsManager } from "./SelfTestsManager.tsx";

/** The h3 "Scheduled self-tests" part of a disk's Monitoring section, with its row actions. */
export function DiskSelfTests({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  return (
    <PageSection heading={t("disk.tests.title")} headingLevel={3}>
      <SelfTestsManager disk={disk} />
    </PageSection>
  );
}
