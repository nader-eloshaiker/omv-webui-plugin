// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Network card (phase 5 design 1.5): is each port connected, and at what address. A
// link is a fact, not a status (D8): an unplugged spare port is normal, so "Not connected" is words and
// its own icon shape, with no colour. Loopback is left out; virtual interfaces (containers, VPNs) are
// counted, not listed. The Wi-Fi key never reaches this page (the transport omits it, UI-6).
//
// With the network pages built (phase 5 network design 13.2): each name is a router link to the
// interface's page, the row this page reaches the NAS through says so (0.4), and the footer leads to
// the Interfaces page. The NAS's name is read only when the page was opened by a name, which is the
// only case 0.4 needs it for.
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import { EmptyState, HealthListSkeleton } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Cable, Monitor, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addressWithPrefix,
  interfaceKind,
  visibleInterfaces,
} from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDashboardConnection } from "../../hooks/useDashboardConnection.ts";
import { standing } from "../../network/connection.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { IfaceLink } from "../atoms/IfaceLink.tsx";
import { CardStaleLine } from "../molecules/CardStaleLine.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

function Address({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        {value === null ? (
          <span className="text-sm text-muted-foreground">
            {t("dashboard.network.noAddress")}
          </span>
        ) : (
          <span className="font-mono text-sm [overflow-wrap:anywhere]">
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

function InterfaceItem({
  device,
  thisPage,
}: {
  device: NetworkDevice;
  /** This page reaches the NAS through it (0.4). */
  thisPage: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const kind = interfaceKind(device.type);
  const speed = format.speed(device.speed);
  const Icon = device.link ? Cable : Unplug;
  return (
    <li className="flex flex-col gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium [overflow-wrap:anywhere]">
          <IfaceLink devicename={device.devicename} />
        </span>
        {kind ? (
          <span className="text-sm text-muted-foreground">
            {t(`dashboard.network.type.${kind}`)}
          </span>
        ) : null}
      </p>
      {thisPage ? (
        <p className="flex items-center gap-1.5 text-sm">
          <Monitor
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          {t("interfaces.thisPage")}
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 text-sm">
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        {device.link
          ? speed === null
            ? t("dashboard.network.connected")
            : t("dashboard.network.connectedAt", { speed })
          : t("dashboard.network.notConnected")}
      </p>
      <dl className="flex flex-col gap-0.5">
        <Address
          label={t("dashboard.network.ipv4")}
          value={addressWithPrefix(device.address, device.prefix)}
        />
        <Address
          label={t("dashboard.network.ipv6")}
          value={addressWithPrefix(device.address6, device.prefix6)}
        />
      </dl>
    </li>
  );
}

export function NetworkCard({
  devices,
  loading,
  error,
  stale,
  updatedAt,
  retrying,
  onRetry,
  className,
  index,
}: {
  devices: readonly NetworkDevice[] | undefined;
  loading: boolean;
  error: unknown;
  stale: boolean;
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
  /** Its place in the page grid, and in the rise-in order. */
  className?: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const connection = useDashboardConnection(devices);
  let content;
  if (devices === undefined && loading) {
    content = <HealthListSkeleton rows={2} />;
  } else if (devices === undefined) {
    content = (
      <ReadFailed
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        className="py-4"
      >
        {t("dashboard.network.loadFailed")}
      </ReadFailed>
    );
  } else {
    const { shown, virtualCount } = visibleInterfaces(devices);
    content = (
      <>
        {shown.length === 0 ? (
          <EmptyState className="py-4">
            {t("dashboard.network.empty")}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((device) => (
              <InterfaceItem
                key={device.devicename}
                device={device}
                thisPage={standing(connection, device.devicename) === "this"}
              />
            ))}
          </ul>
        )}
        {virtualCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.network.virtualHidden", { count: virtualCount })}
          </p>
        ) : null}
        <CardStaleLine
          stale={stale}
          updatedAt={updatedAt}
          retrying={retrying}
          onRetry={onRetry}
        />
      </>
    );
  }
  return (
    <DashboardCard
      className={className}
      index={index}
      title={t("dashboard.network.title")}
      busy={devices === undefined && loading}
      busyLabel={t("dashboard.network.loading")}
      footer={
        <Link to="/network/interfaces" className={routerLinkClass}>
          {t("dashboard.network.link")}
        </Link>
      }
    >
      {content}
    </DashboardCard>
  );
}
