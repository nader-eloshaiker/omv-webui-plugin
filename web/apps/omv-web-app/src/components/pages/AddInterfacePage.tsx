// SPDX-License-Identifier: GPL-3.0-or-later
// Set up a network port, join a Wi-Fi network, make a bond, add a VLAN, make a bridge (phase 5 network
// design 5 to 9, 14.2): one page, the kind from its route (/network/interfaces/add/port, /add/wifi,
// /add/bond, /add/vlan, /add/bridge). Opening it only reads (R9, UI-4). A port chosen on an
// interface's page arrives in memory (portHandover.ts), never in the address. On save the Interfaces
// page opens with focus on the new interface's row (5.7); Cancel goes back there. A normal user gets
// the "only administrators" page, and nothing is called first (14.1).
import { BreadcrumbItem, Breadcrumbs } from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestRowFocus } from "../../network/newIfaceFocus.ts";
import { takeHandedOverPort } from "../../network/portHandover.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import {
  InterfaceForm,
  type InterfaceKind,
} from "../organisms/InterfaceForm.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

const TITLE = {
  ethernet: "ifaceForm.titleNew",
  wifi: "wifi.titleNew",
  bond: "bond.titleNew",
  vlan: "vlan.titleNew",
  bridge: "bridge.titleNew",
} as const satisfies Record<InterfaceKind, string>;

export function AddInterfacePage({ kind }: { kind: InterfaceKind }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("interfaces.title")} />;
  }
  return <AddInterface kind={kind} />;
}

function AddInterface({ kind }: { kind: InterfaceKind }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Taken once: a later visit starts with no port chosen. Only a port or Wi-Fi device is handed over.
  const [port] = useState(() =>
    kind === "ethernet" || kind === "wifi"
      ? (takeHandedOverPort() ?? undefined)
      : undefined,
  );
  const title = t(TITLE[kind]);
  const toList = () => void navigate({ to: "/network/interfaces" });
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/network/interfaces" />}>
          {t("interfaces.title")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{title}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle>{title}</PageTitle>
      <div className="max-w-3xl">
        <InterfaceForm
          mode="new"
          kind={kind}
          devicename={port}
          onCancel={toList}
          onSaved={(devicename) => {
            if (devicename !== "") {
              requestRowFocus(devicename);
            }
            toList();
          }}
        />
      </div>
    </div>
  );
}
