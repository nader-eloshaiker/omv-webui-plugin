// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Network card (phase 5 design 1.5): is each port connected, and at what address. A
// link is a fact, not a status (D8): an unplugged spare port is normal, so "Not connected" is words and
// its own icon shape, with no colour. Loopback is left out; virtual interfaces (containers, VPNs) are
// counted, not listed. The Wi-Fi key never reaches this page (the transport omits it, UI-6).
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import {
  EmptyState,
  ExternalLink,
  HealthListSkeleton,
} from "@omv-webui/react-ui-components";
import { Cable, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addressWithPrefix,
  interfaceKind,
  visibleInterfaces,
} from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
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

function InterfaceItem({ device }: { device: NetworkDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const kind = interfaceKind(device.type);
  const speed = format.speed(device.speed);
  const Icon = device.link ? Cable : Unplug;
  return (
    <li className="flex flex-col gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm font-medium [overflow-wrap:anywhere]">
          {device.devicename}
        </span>
        {kind ? (
          <span className="text-sm text-muted-foreground">
            {t(`dashboard.network.type.${kind}`)}
          </span>
        ) : null}
      </p>
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
}: {
  devices: readonly NetworkDevice[] | undefined;
  loading: boolean;
  error: unknown;
  stale: boolean;
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
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
              <InterfaceItem key={device.devicename} device={device} />
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
      title={t("dashboard.network.title")}
      busy={devices === undefined && loading}
      busyLabel={t("dashboard.network.loading")}
      footer={
        <ExternalLink
          href={CLASSIC.networkInterfaces}
          newTabLabel={t("app.newTab")}
        >
          {t("dashboard.network.link")}
        </ExternalLink>
      }
    >
      {content}
    </DashboardCard>
  );
}
