// SPDX-License-Identifier: GPL-3.0-or-later
// /network/interfaces/add/bridge (phase 5 network design 14.2): the add page for this kind. Static, with
// no parameter: two segments after "interfaces", so it never collides with an interface's page; a port
// chosen elsewhere is handed over in memory, never in the address (UI-4). Opening it only reads (R9).
import { createFileRoute } from "@tanstack/react-router";
import { AddInterfacePage } from "../../../../../components/pages/AddInterfacePage.tsx";

export const Route = createFileRoute(
  "/_signedIn/network/interfaces/add/bridge",
)({
  component: () => <AddInterfacePage kind="bridge" />,
});
