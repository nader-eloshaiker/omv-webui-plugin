// SPDX-License-Identifier: GPL-3.0-or-later
// An interface's page (phase 5 network design 4, 10; 0.3, 0.4, D3, D8), for administrators: what it is
// doing now (getInformation), how it is set up (its stored row, with "In use now" where that differs),
// "Change settings" opening the form in place, "Set up this port…" for a port with no settings (the
// port handed over in memory, never in the address), the member line for a bond's or bridge's port,
// "Blink its light…" for a network port, and "Remove its settings" apart at the end (10). The address
// names the interface by its kernel name, validated by the route; the page finds that name among the
// rows of Network.enumerateDevicesList and asks for nothing else until it has (UI-4). A normal user
// who types the address gets the "only administrators" page, and nothing is called.
//
// VM fact (18.2 #7, P17 as agreed): a port configured outside OMV keeps its address across OMV's
// network apply, so when such a port carries this page it is one plain sentence; the ordinary "Set up
// this port…" stays.
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  Identifier,
  IsolatedIdentifier,
  Page,
  PageHeader,
  PageSection,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Monitor } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import {
  useNetworkPending,
  useStoredRead,
} from "../../hooks/useInterfacesPageReads.ts";
import {
  useConnection,
  useNetworkDevices,
} from "../../hooks/useNetworkReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  hasNoSettings,
  isLoopback,
  isMember,
  isVirtual,
  parentOf,
  standing,
} from "../../network/connection.ts";
import type { DeviceRow, IfaceSettings } from "../../network/dto.ts";
import { kindOf, NETWORK_MODULE, storedFor } from "../../network/ifaceModel.ts";
import { blinkAffectsPage } from "../../network/impact.ts";
import { networkSession } from "../../network/networkSession.ts";
import { handOverPort } from "../../network/portHandover.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { IfaceLink } from "../atoms/IfaceLink.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { IfaceKind } from "../molecules/IfaceConnection.tsx";
import { IfaceReadFailed } from "../molecules/IfaceReadFailed.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { IfaceBlinkDialog } from "../organisms/IfaceBlinkDialog.tsx";
import { IfaceNowCard } from "../organisms/IfaceNowCard.tsx";
import { IfaceRemoveSection } from "../organisms/IfaceRemoveSection.tsx";
import { IfaceSettingsCard } from "../organisms/IfaceSettingsCard.tsx";
import { InterfaceForm } from "../organisms/InterfaceForm.tsx";
import {
  NetworkChangeFlow,
  type NetworkChange,
} from "../organisms/NetworkChangeFlow.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function InterfaceRoutePage() {
  const { iface } = useParams({ from: "/_signedIn/network/interfaces/$iface" });
  return <InterfacePage name={iface} />;
}

export function InterfacePage({ name }: { name: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("interfaces.title")} />;
  }
  // A value that failed the name pattern never reaches a call (UI-4).
  return name === null ? <NotFound name={null} /> : <Found name={name} />;
}

function Crumbs({ current }: { current?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/network/interfaces" />}>
        {t("interfaces.title")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current>
          <bdi dir="ltr">{inertBidi(current)}</bdi>
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

/** 4: "This NAS has no interface named {{iface}}." with a link back; the name only when it was valid. */
function NotFound({ name }: { name: string | null }) {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        before={<Crumbs />}
        title={<PageTitle>{t("interfaces.title")}</PageTitle>}
      />
      <PageSection>
        <EmptyState
          action={
            <Link to="/network/interfaces" className={routerLinkClass}>
              {t("iface.backToList")}
            </Link>
          }
        >
          {name === null ? (
            t("iface.notFoundPlain")
          ) : (
            <Trans
              i18nKey="iface.notFound"
              components={{
                iface: <IsolatedIdentifier value={inertBidi(name)} />,
              }}
            />
          )}
        </EmptyState>
      </PageSection>
    </Page>
  );
}

function Found({ name }: { name: string }) {
  const { t } = useTranslation();
  const { connection, devices, general, refresh } = useConnection();
  const devicesQuery = useNetworkDevices();
  const [refreshing, setRefreshing] = useState(false);

  const retry = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), devicesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const header = (kindNode: ReactNode, children?: ReactNode) => (
    <PageHeader
      before={<Crumbs current={name} />}
      title={
        <PageTitle documentTitle={name}>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <Identifier dir="ltr">{name}</Identifier>
            {kindNode}
          </span>
        </PageTitle>
      }
    >
      {children}
    </PageHeader>
  );

  // The rows as last read: a later read that fails (the NAS restarting its network while a port
  // blinks, a form open) does not take the page away; the connection then says it cannot tell (0.4).
  const rows = devicesQuery.data?.data;
  if (rows === undefined && devices.state !== "failed") {
    return (
      <Page>
        {header(
          null,
          <p role="status" aria-busy="true" className="sr-only">
            {t("interfaces.loading")}
          </p>,
        )}
        <PageSection>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </PageSection>
      </Page>
    );
  }
  if (rows === undefined) {
    return (
      <Page>
        {header(null)}
        <PageSection>
          <ReadFailed
            error={devicesQuery.error}
            onRetry={() => void retry()}
            retrying={refreshing}
          >
            {t("interfaces.loadFailed")}
          </ReadFailed>
        </PageSection>
      </Page>
    );
  }
  const device = rows.find((d) => d.devicename === name && !isLoopback(d));
  if (device === undefined) {
    return <NotFound name={name} />;
  }
  return (
    <Interface
      device={device}
      devices={rows}
      connection={connection}
      hostname={general.state === "ok" ? general.data.hostname : ""}
      refresh={refresh}
      header={(children) =>
        header(<IfaceKind kind={kindOf(device)} />, children)
      }
    />
  );
}

type FocusTarget = "change" | "settings" | null;

function Interface({
  device,
  devices,
  connection,
  hostname,
  refresh,
  header,
}: {
  device: DeviceRow;
  devices: readonly DeviceRow[];
  connection: ReturnType<typeof useConnection>["connection"];
  hostname: string;
  refresh: ReturnType<typeof useConnection>["refresh"];
  /** The page's header, with what it says first (the "this page" note) as children. */
  header: (children?: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = device.devicename;
  // The settings the form was opened for. The form, and the change flow it holds, stay while it is
  // open: a read that fails meanwhile (the NAS restarting its network after the flow's apply) must
  // not take the flow's wait, moved card or recovery card away (1.5).
  const [editing, setEditing] = useState<Pick<
    IfaceSettings,
    "type" | "uuid"
  > | null>(null);
  const [change, setChange] = useState<NetworkChange | null>(null);
  const [blinking, setBlinking] = useState(false);
  const stored = useStoredRead({ focus: editing === null && change === null });
  const pending = useNetworkPending();
  const memory = useMemoryStore(networkSession);
  const changeRef = useRef<HTMLButtonElement>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const blinkRef = useRef<HTMLButtonElement>(null);
  const settingsId = useId();
  const removeId = useId();
  const findId = useId();
  // Where focus goes once the form closes or a port's settings are removed (4.5).
  const focusNextRef = useRef<FocusTarget>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const target = focusNextRef.current;
    if (target === null) {
      return;
    }
    const element =
      target === "change" ? changeRef.current : settingsHeadingRef.current;
    if (element === null) {
      return;
    }
    focusNextRef.current = null;
    element.focus();
    // The confirmation closing as its section goes hands focus back to a button that is no longer
    // there; take it once more after that.
    focusTimerRef.current = setTimeout(() => {
      if (element.isConnected && document.activeElement === document.body) {
        element.focus();
      }
    }, 0);
  });
  useEffect(
    () => () => {
      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current);
      }
    },
    [],
  );

  const kind = kindOf(device);
  const settings: IfaceSettings | null =
    stored.read.state === "ok" ? storedFor(stored.read.data, name) : null;
  const member = isMember(device, devices);
  const parent = member ? parentOf(name, devices) : null;
  const virtual = isVirtual(device);
  // Settings as the live list says (it carries the stored fields), so a failed settings read still
  // knows there are some.
  const hasSettings = settings !== null || !hasNoSettings(device);
  const thisPage =
    standing(connection, name) === "this" &&
    (connection.kind === "known" || connection.kind === "probable");
  const unmanaged =
    connection.kind === "unmanaged" &&
    !connection.virtual &&
    connection.iface === name;
  const savedHere =
    settings !== null &&
    pending.includes(NETWORK_MODULE) &&
    memory.ifacesSaved.includes(settings.uuid);

  const flowDone = (removed: NetworkChange | null) => {
    setChange(null);
    if (
      removed !== null &&
      removed.action === "ifaceRemoved" &&
      removed.object.kind === "iface" &&
      removed.object.type !== "ethernet"
    ) {
      void navigate({ to: "/network/interfaces" });
    }
  };

  if (change !== null) {
    return (
      <Page>
        {header()}
        <NetworkChangeFlow
          change={change}
          onBack={() => setChange(null)}
          onCancel={() => setChange(null)}
          onDone={() => flowDone(change)}
        />
      </Page>
    );
  }

  const removed = (was: IfaceSettings) => {
    if (was.type === "ethernet") {
      focusNextRef.current = "settings";
      return;
    }
    // A bond, VLAN, bridge or Wi-Fi interface no longer exists once applied: back to the list, whose
    // title takes focus (10.2).
    void navigate({ to: "/network/interfaces" });
  };

  let settingsSection: ReactNode = null;
  if (member) {
    const bridge =
      devices.find((d) => d.devicename === parent)?.type === "bridge";
    settingsSection = (
      <Card
        render={<section aria-labelledby={settingsId} />}
        className="flex flex-col gap-pair p-4"
      >
        <h2
          id={settingsId}
          ref={settingsHeadingRef}
          tabIndex={-1}
          className="text-section text-foreground"
        >
          {t("iface.settings")}
        </h2>
        <p className="max-w-prose">
          <Trans
            i18nKey={bridge ? "iface.memberBridge" : "iface.member"}
            components={{
              parent:
                parent === null ? <></> : <IfaceLink devicename={parent} />,
            }}
          />
        </p>
      </Card>
    );
  } else if (virtual) {
    settingsSection = null;
  } else if (hasSettings) {
    if (editing !== null) {
      settingsSection = (
        <InterfaceForm
          mode="change"
          kind={editing.type}
          devicename={name}
          uuid={editing.uuid}
          onCancel={() => {
            focusNextRef.current = "change";
            setEditing(null);
          }}
          onSaved={() => {
            focusNextRef.current = "change";
            setEditing(null);
          }}
        />
      );
    } else if (stored.read.state === "loading") {
      settingsSection = <Skeleton className="h-64 w-full" />;
    } else if (stored.read.state === "failed") {
      settingsSection = (
        <Card
          render={<section aria-labelledby={settingsId} />}
          className="flex flex-col gap-group p-4"
        >
          <h2
            id={settingsId}
            ref={settingsHeadingRef}
            tabIndex={-1}
            className="text-section text-foreground"
          >
            {t("iface.settings")}
          </h2>
          <IfaceReadFailed
            sentence="iface.loadSettingsFailed"
            iface={name}
            error={stored.query.error}
            onRetry={() => void stored.query.refetch()}
            retrying={stored.query.isFetching}
          />
          <div>
            <Button variant="neutral" disabled focusableWhenDisabled>
              {t("iface.change")}
            </Button>
          </div>
        </Card>
      );
    } else if (settings === null) {
      settingsSection = (
        <Card
          render={<section aria-labelledby={settingsId} />}
          className="flex flex-col gap-pair p-4"
        >
          <h2
            id={settingsId}
            ref={settingsHeadingRef}
            tabIndex={-1}
            className="text-section text-foreground"
          >
            {t("iface.settings")}
          </h2>
          <p className="max-w-prose">{t("iface.set.unhandled")}</p>
        </Card>
      );
    } else {
      settingsSection = (
        <IfaceSettingsCard
          settings={settings}
          live={device}
          pending={savedHere}
          changeRef={changeRef}
          onChange={() => {
            setEditing({ type: settings.type, uuid: settings.uuid });
          }}
          changeUnavailable={null}
        />
      );
    }
  } else if (kind === "ethernet" || kind === "wifi") {
    // 4.2 item 5: not set up here.
    settingsSection = (
      <Card
        render={<section aria-labelledby={settingsId} />}
        className="flex flex-col gap-group p-4"
      >
        <h2
          id={settingsId}
          ref={settingsHeadingRef}
          tabIndex={-1}
          className="text-section text-foreground"
        >
          {t("iface.settings")}
        </h2>
        <p className="max-w-prose">
          {unmanaged ? t("iface.unmanaged") : t("iface.notSetUp")}
        </p>
        <div>
          <Button
            onClick={() => {
              handOverPort(name);
              void navigate({
                to:
                  kind === "wifi"
                    ? "/network/interfaces/add/wifi"
                    : "/network/interfaces/add/port",
              });
            }}
          >
            {t("iface.setUp")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Page>
      {header(
        thisPage ? (
          <p className="flex max-w-prose items-start gap-2 rounded-card border border-border bg-muted p-3">
            <Monitor
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>{t("iface.thisPage")}</span>
          </p>
        ) : null,
      )}
      <IfaceNowCard device={device} devices={devices} />
      {settingsSection}
      {kind === "ethernet" ? (
        <Card
          render={<section aria-labelledby={findId} />}
          className="flex flex-col gap-group p-4"
        >
          <h2 id={findId} className="text-section text-foreground">
            {t("iface.find")}
          </h2>
          <div>
            <Button
              ref={blinkRef}
              variant="neutral"
              onClick={() => setBlinking(true)}
            >
              {t("iface.blinkOpen")}
            </Button>
          </div>
          <IfaceBlinkDialog
            open={blinking}
            onOpenChange={setBlinking}
            devicename={name}
            affectsPage={blinkAffectsPage(connection, name)}
          />
        </Card>
      ) : null}
      {settings !== null &&
      !member &&
      editing === null &&
      stored.read.state === "ok" ? (
        <IfaceRemoveSection
          settings={settings}
          live={device}
          devices={devices}
          stored={stored.read.data}
          connection={connection}
          refresh={refresh}
          hostname={hostname}
          onReview={setChange}
          onRemoved={removed}
        />
      ) : hasSettings &&
        !member &&
        !virtual &&
        stored.read.state === "failed" ? (
        <Card
          render={<section aria-labelledby={removeId} />}
          className="flex flex-col gap-group p-4"
        >
          <h2 id={removeId} className="text-section text-foreground">
            {t("ifaceDelete.section")}
          </h2>
          <p className="max-w-prose">{t("ifaceDelete.sectionBody")}</p>
          <div>
            <Button variant="neutral" disabled focusableWhenDisabled>
              {t("ifaceDelete.open")}
            </Button>
          </div>
        </Card>
      ) : null}
      <footer className="flex flex-col gap-line text-sm text-muted-foreground">
        <p>
          <ExternalLink
            href={CLASSIC.networkInterfaces}
            newTabLabel={t("app.newTab")}
          >
            {t("iface.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </Page>
  );
}
