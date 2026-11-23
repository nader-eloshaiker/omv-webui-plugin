// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync at /services/rsync (phase 5 services design 3): the Rsync page with its Copy jobs
// tab current.
import { CopyJobsTab } from "./CopyJobsTab.tsx";
import { RsyncPage } from "./RsyncPage.tsx";

export function CopyJobsPage() {
  return (
    <RsyncPage tab="jobs">
      <CopyJobsTab />
    </RsyncPage>
  );
}
