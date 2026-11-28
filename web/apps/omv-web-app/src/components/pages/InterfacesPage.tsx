// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Interfaces (phase 5 network design 3; 0.3, 0.4, D8), for administrators: which interface
// this page reaches the NAS through, the attention lines worst first, "Set up…" with the reason beside
// an item that has nothing to choose from, and one row per interface with its connection and how each
// family gets its address, members indented under their bond or bridge. Interfaces have no status
// colour: what they do is said in words with a neutral icon. Read on opening, Refresh and window
// focus; not polled (the dashboard's card is the live view). A normal user who types the address gets
// the "only administrators" page, and nothing is called.
//
// VM fact (18.2 #7, P17 as agreed): a port configured outside OMV keeps its address across OMV's
// network apply, so the page's port without settings here is one plain line, with no offer to set it
// up as it is now.
import {
  Button,
  EmptyState,
  ExternalLink,
  IconButton,
  IsolatedIdentifier,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Page,
  PageHeader,
  PageSection,
  PairStack,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { useNavigate } from "@tanstack/react-router";
import { CircleDashed, Link2, Monitor, RefreshCw } from "lucide-react";
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
  attentionLines,
  interfaceRows,
  setUpMenu,
  type AttentionLine,
  type IfaceListRow,
  type SetUpAvailability,
  type SetUpItem,
} from "../../network/ifaceModel.ts";
import { networkSession } from "../../network/networkSession.ts";
import { clearRowFocus, newIfaceFocus } from "../../network/newIfaceFocus.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { IfaceLink } from "../atoms/IfaceLink.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { IfaceConnection, IfaceKind } from "../molecules/IfaceConnection.tsx";
import { NetworkConnectionLine } from "../molecules/NetworkConnectionLine.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function InterfacesPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("interfaces.title")} />;
  }
  return <Interfaces />;
}

function Interfaces() {
  const { t } = useTranslation();
  const { connection, devices, refresh } = useConnection();
  const devicesQuery = useNetworkDevices();
  const stored = useStoredRead();
  const pending = useNetworkPending();
  const memory = useMemoryStore(networkSession);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        stored.query.refetch(),
        devicesQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const menu = setUpMenu(devices, stored.read);
  const list =
    devices.state === "ok"
      ? interfaceRows({
          devices: devices.data,
          stored: stored.read,
          connection,
          savedThisSession: memory.ifacesSaved,
          pending,
        })
      : null;
  const attention =
    devices.state === "ok" && list !== null
      ? attentionLines(list.rows, devices.data, connection)
      : [];

  let content: ReactNode;
  if (devices.state === "failed") {
    content = (
      <ReadFailed
        error={devicesQuery.error}
        onRetry={() => void onRefresh()}
        retrying={refreshing}
      >
        {t("interfaces.loadFailed")}
      </ReadFailed>
    );
  } else if (list === null) {
    content = (
      <div className="flex flex-col gap-pair" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  } else if (list.rows.length === 0) {
    content = <EmptyState>{t("interfaces.empty")}</EmptyState>;
  } else {
    content = <InterfacesTable rows={list.rows} />;
  }

  return (
    <Page>
      <PageHeader title={<PageTitle>{t("interfaces.title")}</PageTitle>}>
        <p className="max-w-prose">{t("network.term.interface")}</p>
        <NetworkConnectionLine connection={connection} />
        {attention.length > 0 ? <AttentionLines lines={attention} /> : null}
      </PageHeader>
      <PageSection>
        <PairStack>
          <TableToolbar aria-label={t("interfaces.title")}>
            <SetUpMenu menu={menu} />
            <IconButton
              label={t("interfaces.refresh")}
              icon={<RefreshCw />}
              variant="neutral"
              loading={refreshing}
              onClick={() => void onRefresh()}
            />
          </TableToolbar>
          {content}
          {list !== null && list.virtualHidden > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("interfaces.virtualHidden", { count: list.virtualHidden })}
            </p>
          ) : null}
        </PairStack>
      </PageSection>
      <footer className="flex flex-col gap-line text-sm text-muted-foreground">
        <p>{t("interfaces.footerLine")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.networkInterfaces}
            newTabLabel={t("app.newTab")}
          >
            {t("interfaces.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </Page>
  );
}

/** 3.2 item 3: one line each, worst first, the interface a router link. */
function AttentionLines({ lines }: { lines: readonly AttentionLine[] }) {
  return (
    <ul className="flex max-w-prose flex-col gap-1.5">
      {lines.map((line) => (
        <li
          key={`${line.code}:${line.iface}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span>
            <Trans
              i18nKey={line.code}
              components={{ iface: <IfaceLink devicename={line.iface} /> }}
            />
          </span>
          {line.code === "interfaces.attn.notApplied" ? <PendingMark /> : null}
        </li>
      ))}
    </ul>
  );
}

const SET_UP_ITEMS: readonly SetUpItem[] = [
  "port",
  "wifi",
  "bond",
  "vlan",
  "bridge",
];

/** 3.2 item 4: "Set up…", each item unavailable with its reason when it has nothing to choose from. */
function SetUpMenu({ menu }: { menu: Record<SetUpItem, SetUpAvailability> }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reasonId = useId();
  const go = (item: SetUpItem) => {
    switch (item) {
      case "port":
        void navigate({ to: "/network/interfaces/add/port" });
        break;
      case "wifi":
        void navigate({ to: "/network/interfaces/add/wifi" });
        break;
      case "bond":
        void navigate({ to: "/network/interfaces/add/bond" });
        break;
      case "vlan":
        void navigate({ to: "/network/interfaces/add/vlan" });
        break;
      case "bridge":
        void navigate({ to: "/network/interfaces/add/bridge" });
        break;
    }
  };
  // A read the menu needs failed: the whole menu is unavailable, with the reason beside it.
  const whole = menu.port.available ? null : menu.port.code;
  if (
    whole === "interfaces.loadFailed" ||
    whole === "interfaces.settingsFailed"
  ) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Button
          variant="neutral"
          disabled
          focusableWhenDisabled
          aria-describedby={reasonId}
        >
          {t("interfaces.add.label")}
        </Button>
        <span id={reasonId} className="text-sm text-muted-foreground">
          {t(whole)}
        </span>
      </span>
    );
  }
  return (
    <Menu>
      <MenuTrigger render={<Button variant="neutral" />}>
        {t("interfaces.add.label")}
      </MenuTrigger>
      <MenuContent>
        {SET_UP_ITEMS.map((item) => {
          const availability = menu[item];
          return (
            <MenuItem
              key={item}
              disabled={!availability.available}
              onClick={() => go(item)}
            >
              <span className="flex flex-col">
                <span>{t(`interfaces.add.${item}`)}</span>
                {availability.available ? null : (
                  <span className="text-sm text-muted-foreground">
                    {t(availability.code)}
                  </span>
                )}
              </span>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

/** Below 720px the table scrolls in its own region with the first column fixed (3.2 item 5). */
const FIXED_FIRST =
  "max-[720px]:sticky max-[720px]:left-0 max-[720px]:z-10 max-[720px]:bg-surface";

/** 3.2 item 5. */
function InterfacesTable({ rows }: { rows: readonly IfaceListRow[] }) {
  const { t } = useTranslation();
  const tableRef = useRef<HTMLTableElement>(null);
  // A new interface was just saved on the add page: its row takes focus once listed (5.7).
  const wanted = useMemoryStore(newIfaceFocus).devicename;
  useEffect(() => {
    if (wanted === null || tableRef.current === null) {
      return;
    }
    const row = Array.from(
      tableRef.current.querySelectorAll<HTMLTableRowElement>("tr[data-iface]"),
    ).find((tr) => tr.dataset.iface === wanted);
    const link = row?.querySelector<HTMLElement>("a");
    if (link !== undefined && link !== null) {
      link.focus();
      clearRowFocus();
    }
  }, [wanted, rows]);
  return (
    <Table ref={tableRef} frameLabel={t("interfaces.title")}>
      <TableHeader>
        <TableRow>
          <TableHead className={`${FIXED_FIRST} max-[720px]:bg-muted`}>
            {t("interfaces.col.iface")}
          </TableHead>
          <TableHead>{t("interfaces.col.connection")}</TableHead>
          <TableHead>{t("interfaces.col.ipv4")}</TableHead>
          <TableHead>{t("interfaces.col.ipv6")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("interfaces.col.pending")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.devicename}
            className="max-[720px]:*:h-11"
            data-depth={row.depth}
            data-iface={row.devicename}
          >
            <TableCell className={`max-w-72 min-w-40 ${FIXED_FIRST}`}>
              <div
                className={
                  row.depth === 0
                    ? "flex flex-col gap-0.5"
                    : row.depth === 1
                      ? "flex flex-col gap-0.5 ps-6"
                      : "flex flex-col gap-0.5 ps-12"
                }
              >
                <span className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
                  <IfaceLink devicename={row.devicename} />
                  <IfaceKind kind={row.kind} />
                </span>
                {row.thisPage ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    <Monitor
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    {t("interfaces.thisPage")}
                  </span>
                ) : null}
                {row.partOf !== null ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    <Link2
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span>
                      <Trans
                        i18nKey="interfaces.partOf"
                        components={{
                          parent: <IfaceLink devicename={row.partOf} />,
                        }}
                      />
                    </span>
                  </span>
                ) : null}
                {row.runsOn !== null ? (
                  <span className="text-sm">
                    <Trans
                      i18nKey="interfaces.runsOn"
                      components={{
                        parent: <IfaceLink devicename={row.runsOn} />,
                      }}
                    />
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="min-w-36">
              <IfaceConnection word={row.connection} />
            </TableCell>
            <TableCell className="min-w-44">
              <FamilyCell family={row.ipv4} />
            </TableCell>
            <TableCell className="min-w-44">
              <FamilyCell family={row.ipv6} />
            </TableCell>
            <TableCell>{row.notApplied ? <PendingMark /> : null}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** How a family gets its address, and the address in use with its size, or "No address". */
function FamilyCell({ family }: { family: IfaceListRow["ipv4"] }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {family.how === "interfaces.how.notSetUp" ? (
          <CircleDashed aria-hidden="true" className="size-4 shrink-0" />
        ) : null}
        {t(family.how)}
      </span>
      {family.inUse === null ? (
        <span className="text-sm text-muted-foreground">
          {t("interfaces.noAddress")}
        </span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-1.5 [overflow-wrap:anywhere]">
          <IsolatedIdentifier value={inertBidi(family.inUse.text)} />
          {family.inUse.linkLocal ? (
            <span className="text-sm text-muted-foreground">
              {t("interfaces.linkLocal")}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
