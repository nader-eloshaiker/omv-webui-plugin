// SPDX-License-Identifier: GPL-3.0-or-later
// An interface's name as a router link to its page (phase 5 network design 0.2, 3.2, 4.2, 13.2): the
// name in mono, isolated, with any bidirectional control shown (UI-2). The address takes the name from
// a reply only when it passes the route's pattern (D3); otherwise the name stays text, with no link.
import { IsolatedIdentifier } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { inertBidi } from "../../format/isolate.ts";
import { isInterfaceName } from "../../network/ifaceName.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function IfaceLink({
  devicename,
  className,
}: {
  devicename: string;
  className?: string;
}) {
  const shown = <IsolatedIdentifier value={inertBidi(devicename)} />;
  if (!isInterfaceName(devicename)) {
    return shown;
  }
  return (
    <Link
      to="/network/interfaces/$iface"
      params={{ iface: devicename }}
      className={className ?? routerLinkClass}
    >
      {shown}
    </Link>
  );
}
