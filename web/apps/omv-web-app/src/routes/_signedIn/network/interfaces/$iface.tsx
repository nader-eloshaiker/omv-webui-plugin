// SPDX-License-Identifier: GPL-3.0-or-later
// An interface's page (phase 5 network design 4, 14.2, D3). The one path parameter is the interface's
// kernel name, and only a value that passes the contract's name pattern reaches the page as a name:
// anything else becomes null, which the page shows as not found without an interface-specific call
// (UI-4). The page finds the row in Network.enumerateDevicesList and uses that row's name for every
// call, never the address. Nothing in it names a call.
import { createFileRoute } from "@tanstack/react-router";
import { InterfaceRoutePage } from "../../../../components/pages/InterfacePage.tsx";
import { isInterfaceName } from "../../../../network/ifaceName.ts";

export const Route = createFileRoute("/_signedIn/network/interfaces/$iface")({
  params: {
    parse: ({ iface }) => ({ iface: isInterfaceName(iface) ? iface : null }),
    stringify: ({ iface }) => ({ iface: iface ?? "" }),
  },
  component: InterfaceRoutePage,
});
