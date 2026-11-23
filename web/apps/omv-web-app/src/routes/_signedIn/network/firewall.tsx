// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Firewall, "Firewall rules" (phase 5 network design 11), built in this interface; more
// specific than /$group/$item, so it wins. The IPv6 list is a view on the page, not a route. Its own
// chunk.
import { createFileRoute } from "@tanstack/react-router";
import { FirewallPage } from "../../../components/pages/FirewallPage.tsx";

export const Route = createFileRoute("/_signedIn/network/firewall")({
  component: FirewallPage,
});
