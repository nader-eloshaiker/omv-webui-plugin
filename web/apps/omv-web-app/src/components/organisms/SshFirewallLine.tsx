// SPDX-License-Identifier: GPL-3.0-or-later
// The SSH page's one firewall line (phase 5 network design 13.4): when the stored firewall rules block
// SSH for every computer (the IPv4 rules, and the IPv6 rules when this page uses IPv6), "The firewall
// blocks SSH for every computer." with a router link to the firewall page. Reads only; nothing is
// shown while they are on their way, when one fails, or when SSH is off.
import { InlineAlert } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useFirewallContext } from "../../hooks/useFirewallContext.ts";
import {
  useFirewallRules4,
  useFirewallRules6,
} from "../../hooks/useNetworkReads.ts";
import { pageFamilies } from "../../network/connection.ts";
import { sshBlockedForAll } from "../../network/firewallCheck.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function SshFirewallLine() {
  const { t } = useTranslation();
  const context = useFirewallContext();
  const usesIpv6 = pageFamilies(context.check.connection).includes(6);
  const rules4 = useFirewallRules4();
  const rules6 = useFirewallRules6({ enabled: usesIpv6 });
  if (!context.settled) {
    return null;
  }
  const blocked =
    (rules4.data !== undefined &&
      sshBlockedForAll(rules4.data, 4, context.check)) ||
    (usesIpv6 &&
      rules6.data !== undefined &&
      sshBlockedForAll(rules6.data, 6, context.check));
  if (!blocked) {
    return null;
  }
  return (
    <InlineAlert tone="neutral" icon="warning" role="note">
      <span>
        {t("ssh.firewallBlocked")}{" "}
        <Link to="/network/firewall" className={routerLinkClass}>
          {t("ssh.firewallLink")}
        </Link>
      </span>
    </InlineAlert>
  );
}
