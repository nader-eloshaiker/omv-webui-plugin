// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health (S.M.A.R.T.), the menu item: its Overview tab. A fixed redirect, written here
// (UI-3); it makes no call, so a normal user lands on the "only administrators" page of that tab.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/storage/smart/")({
  beforeLoad: () => {
    throw redirect({ to: "/storage/smart/overview", replace: true });
  },
});
