// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Proxy (phase 5 network design 12), built in this interface; more specific than
// /$group/$item, so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { ProxyPage } from "../../../components/pages/ProxyPage.tsx";

export const Route = createFileRoute("/_signedIn/network/proxy")({
  component: ProxyPage,
});
