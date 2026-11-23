// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Firewall, "Firewall rules" (phase 5 network design 11), for administrators: what traffic
// the rules let in and out, and whether they let this page in. The IPv4 and IPv6 lists are two views
// of one page (P2), chosen on the page, not in the address (14.2). An order changed on the page and
// not saved is kept per list until it is saved or discarded; leaving the page with one asks first. A
// normal user who types the address gets the "only administrators" page, and nothing is called.
import {
  ExternalLink,
  PageTab,
  PageTabs,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirewallContext } from "../../hooks/useFirewallContext.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import type { Family } from "../../network/ip.ts";
import { networkSession } from "../../network/networkSession.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { NetworkConnectionLine } from "../molecules/NetworkConnectionLine.tsx";
import {
  FirewallRules,
  type UnsavedOrder,
} from "../organisms/FirewallRules.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function FirewallPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("firewall.title")} />;
  }
  return <Firewall />;
}

const FAMILIES: readonly Family[] = [4, 6];

function Firewall() {
  const { t } = useTranslation();
  const [family, setFamily] = useState<Family>(4);
  const [orders, setOrders] = useState<Record<Family, UnsavedOrder | null>>({
    4: null,
    6: null,
  });
  const unsaved = orders[4] !== null || orders[6] !== null;
  // While an order is unsaved, the page does not read again on focus: what it shows stays put.
  const context = useFirewallContext({ focus: !unsaved });
  const info = useSystemInformation("admin");
  const memory = useMemoryStore(networkSession);
  const pending =
    pendingModules(info.data?.dirtyModules).includes("iptables") &&
    memory.rulesSaved.length > 0;

  const header = (
    <>
      <NetworkConnectionLine connection={context.check.connection} />
      <PageTabs aria-label={t("firewall.tabs")}>
        {FAMILIES.map((each) => (
          <PageTab
            key={each}
            current={each === family}
            render={<button type="button" onClick={() => setFamily(each)} />}
          >
            {t(each === 4 ? "firewall.tab.ipv4" : "firewall.tab.ipv6")}
          </PageTab>
        ))}
      </PageTabs>
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageTitle>{t("firewall.title")}</PageTitle>
        {pending ? <PendingMark /> : null}
      </div>
      <p className="max-w-prose">{t("network.term.firewall")}</p>
      <FirewallRules
        key={family}
        family={family}
        context={context}
        order={orders[family]}
        onOrder={(order) => setOrders((o) => ({ ...o, [family]: order }))}
        header={header}
      />
      <LeaveGuard when={unsaved} />
      <footer className="text-sm text-muted-foreground">
        <ExternalLink href={CLASSIC.firewall} newTabLabel={t("app.newTab")}>
          {t("firewall.classicLink")}
        </ExternalLink>
      </footer>
    </div>
  );
}
