// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Services, the menu item: its first tab. A fixed redirect, written here (UI-3); it makes
// no call, so a normal user lands on the "only administrators" page of that tab.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/diagnostics/services/")({
  beforeLoad: () => {
    throw redirect({ to: "/diagnostics/services/smb", replace: true });
  },
});
