// SPDX-License-Identifier: GPL-3.0-or-later
// The route target of Services > Rsync > Rsync server (phase 5 services design 9): the Rsync page with
// its second tab current, and the tab's content.
import { RsyncPage } from "./RsyncPage.tsx";
import { RsyncServerTab } from "./RsyncServerTab.tsx";

export function RsyncServerPage() {
  return (
    <RsyncPage tab="server">
      <RsyncServerTab />
    </RsyncPage>
  );
}
