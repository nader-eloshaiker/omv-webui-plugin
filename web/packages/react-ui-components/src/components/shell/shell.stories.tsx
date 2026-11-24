// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Activity,
  Cpu,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LockOpen,
  Menu as MenuIcon,
  Network,
  Puzzle,
  Share2,
  UserRound,
  Users,
} from "lucide-react";
import * as React from "react";
import { NoticeBanner } from "../banner/notice-banner";
import { Button, IconButton } from "../button/button";
import {
  CommandPalette,
  CommandPaletteTrigger,
  type CommandItem,
} from "../command-palette/command-palette";
import { useCommandKeys } from "../command-palette/use-command-keys";
import { DensityToggle, type Density } from "../density-toggle/density-toggle";
import { ExternalLink } from "../external-link/external-link";
import { flyPendingMark } from "../flight/flight";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "../menu/menu";
import {
  PendingBand,
  type PendingBandState,
} from "../pending-band/pending-band";
import { PendingPill } from "../pending-pill/pending-pill";
import {
  SideNav,
  SideNavDrawer,
  SideNavGroup,
  SideNavItem,
  SideNavList,
} from "../side-nav/side-nav";
import { SkipLink } from "../skip-link/skip-link";
import { TaskRow } from "../task-row/task-row";
import { TopBar, TopBarBrand } from "../top-bar/top-bar";
import { Shell } from "./shell";

/** A 390px phone, the width the foundation checks every screen at. */
const PHONE = {
  phone390: {
    name: "Phone, 390px",
    styles: { width: "390px", height: "844px" },
    type: "mobile" as const,
  },
};

const meta = {
  title: "Patterns/Shell",
  parameters: { layout: "fullscreen", viewport: { options: PHONE } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Page {
  id: string;
  label: string;
  classic?: boolean;
  jump?: string;
}

interface Group {
  id: string;
  label: string;
  icon: React.ReactElement;
  pages: Page[];
}

/** OMV's own menu, grouped and ordered as the stock interface does. */
const GROUPS: Group[] = [
  {
    id: "system",
    label: "System",
    icon: <Cpu />,
    pages: [
      { id: "workbench", label: "Workbench", classic: true },
      { id: "date-time", label: "Date & time", classic: true },
      { id: "notification", label: "Notifications", classic: true },
      { id: "powermgmt", label: "Power management", classic: true },
      { id: "monitoring", label: "Monitoring", classic: true },
      { id: "cron", label: "Scheduled tasks", classic: true },
      { id: "certificate", label: "Certificates", classic: true },
      { id: "updatemgmt", label: "Updates", classic: true },
      { id: "plugins", label: "Plugins", classic: true },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: <Network />,
    pages: [
      { id: "general", label: "General" },
      { id: "interfaces", label: "Interfaces", jump: "n" },
      { id: "proxy", label: "Proxy" },
      { id: "firewall", label: "Firewall" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: <HardDrive />,
    pages: [
      { id: "disks", label: "Disks", jump: "d" },
      { id: "smart", label: "Disk health" },
      { id: "md", label: "RAID" },
      { id: "zfs", label: "ZFS" },
      { id: "filesystems", label: "File systems", jump: "f" },
      { id: "shared-folders", label: "Shared folders", jump: "s" },
    ],
  },
  {
    id: "services",
    label: "Services",
    icon: <Share2 />,
    pages: [
      { id: "nfs", label: "NFS" },
      { id: "rsync", label: "Rsync" },
      { id: "smb", label: "SMB/CIFS" },
      { id: "ssh", label: "SSH" },
    ],
  },
  {
    id: "usermgmt",
    label: "Users",
    icon: <Users />,
    pages: [
      { id: "settings", label: "Settings" },
      { id: "users", label: "Users", jump: "u" },
      { id: "groups", label: "Groups" },
    ],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    icon: <Activity />,
    pages: [
      { id: "system-logs", label: "System logs", jump: "l" },
      { id: "processes", label: "Processes" },
      { id: "services", label: "Services" },
      { id: "system-information", label: "System information", classic: true },
      { id: "report", label: "Report", classic: true },
    ],
  },
];

/** Items other plugins add: they stay in the classic interface, in the group the plugin chose. */
const PLUGIN_PAGES: Record<string, Page[]> = {
  services: [
    { id: "compose", label: "Compose", classic: true },
    { id: "wireguard", label: "WireGuard", classic: true },
    { id: "minidlna", label: "DLNA media server", classic: true },
    { id: "fail2ban", label: "Fail2ban", classic: true },
    { id: "wol", label: "Wake on LAN", classic: true },
    { id: "ftp", label: "FTP", classic: true },
    { id: "kvm", label: "Virtual machines", classic: true },
  ],
  storage: [
    { id: "snapraid", label: "SnapRAID", classic: true },
    { id: "remotemount", label: "Remote mount", classic: true },
    { id: "mergerfs", label: "mergerfs pools", classic: true },
  ],
  system: [
    { id: "backup", label: "Backup", classic: true },
    { id: "kernel", label: "Kernel", classic: true },
    { id: "omv-extras", label: "omv-extras", classic: true },
  ],
};

const MODULES = [
  "SMB",
  "SSH",
  "Network interfaces",
  "Firewall",
  "NFS",
  "Rsync server",
  "Time",
  "Notifications",
  "Shared folders",
  "Disk monitoring",
  "Web interface",
  "Scheduled tasks",
];

/** The page shown: a group id and page id, or the dashboard. */
type PageRef = { group: string; id: string } | "dashboard";

interface DemoProps {
  page?: PageRef;
  pending?: number;
  state?: PendingBandState;
  density?: Density;
  plugins?: boolean;
  drawerOpen?: boolean;
  paletteOpen?: boolean;
  notice?: boolean;
}

function changes(n: number) {
  return `${n} ${n === 1 ? "change" : "changes"}`;
}

function DemoShell({
  page: initialPage = { group: "storage", id: "shared-folders" },
  pending: initialPending = 0,
  state: initialState = "idle",
  density: initialDensity = "comfortable",
  plugins = false,
  drawerOpen = false,
  paletteOpen = false,
  notice = true,
}: DemoProps) {
  const [page, setPage] = React.useState<PageRef>(initialPage);
  const [pending, setPending] = React.useState(initialPending);
  const [state, setState] = React.useState<PendingBandState>(initialState);
  const [density, setDensity] = React.useState<Density>(initialDensity);
  const [drawer, setDrawer] = React.useState(drawerOpen);
  const [palette, setPalette] = React.useState(paletteOpen);
  const pillRef = React.useRef<HTMLButtonElement>(null);

  const groups = GROUPS.map((g) => ({
    ...g,
    pages: plugins ? [...g.pages, ...(PLUGIN_PAGES[g.id] ?? [])] : g.pages,
  }));
  const current = page === "dashboard" ? null : page;
  const title =
    page === "dashboard"
      ? "Dashboard"
      : (groups
          .find((g) => g.id === page.group)
          ?.pages.find((p) => p.id === page.id)?.label ?? "");

  const go = (next: PageRef) => {
    setPage(next);
    setDrawer(false);
  };
  const jumps: Record<string, () => void> = { o: () => go("dashboard") };
  for (const g of groups) {
    for (const p of g.pages) {
      if (p.jump) {
        jumps[p.jump] = () => go({ group: g.id, id: p.id });
      }
    }
  }
  useCommandKeys({
    onOpenPalette: () => setPalette(true),
    jumps,
    enabled: !palette,
  });

  const apply = () => {
    setState("applying");
    window.setTimeout(() => {
      setState("applied");
      window.setTimeout(() => {
        setPending(0);
        setState("idle");
      }, 1600);
    }, 2400);
  };

  const commands: CommandItem[] = [
    ...(pending > 0
      ? [
          {
            id: "apply",
            label: `Apply ${pending} pending ${pending === 1 ? "change" : "changes"}`,
            group: "Do",
            hint: MODULES.slice(0, pending).join(", "),
            onSelect: apply,
          },
        ]
      : []),
    {
      id: "dashboard",
      label: "Dashboard",
      group: "Go to",
      shortcut: ["g", "o"],
      onSelect: () => go("dashboard"),
    },
    ...groups.flatMap((g) =>
      g.pages.map((p) => ({
        id: `${g.id}/${p.id}`,
        label: p.label,
        group: "Go to",
        hint: p.classic ? `${g.label} · classic interface` : g.label,
        external: p.classic,
        shortcut: p.jump ? ["g", p.jump] : undefined,
        onSelect: () => go({ group: g.id, id: p.id }),
      })),
    ),
  ];

  const nav = (
    <>
      <SideNavList className="mb-1">
        <SideNavItem
          href="#dashboard"
          icon={<LayoutDashboard />}
          current={page === "dashboard"}
          onClick={(event) => {
            event.preventDefault();
            go("dashboard");
          }}
        >
          Dashboard
        </SideNavItem>
      </SideNavList>
      {groups.map((g) => (
        <SideNavGroup
          key={g.id}
          label={g.label}
          icon={g.icon}
          current={current?.group === g.id}
        >
          {g.pages.map((p) => (
            <SideNavItem
              key={p.id}
              href={`#${g.id}/${p.id}`}
              current={current?.group === g.id && current.id === p.id}
              classicOnly={p.classic ? { label: "Classic" } : undefined}
              onClick={(event) => {
                event.preventDefault();
                go({ group: g.id, id: p.id });
              }}
            >
              {p.label}
            </SideNavItem>
          ))}
        </SideNavGroup>
      ))}
      <SideNavList className="mt-1">
        <SideNavItem
          href="#add-ons"
          icon={<Puzzle />}
          classicOnly={{ label: "Classic" }}
        >
          Add-ons
        </SideNavItem>
      </SideNavList>
    </>
  );

  const brand = (
    <TopBarBrand
      href="#dashboard"
      productName="openmediavault"
      hostName="nas.example.org"
    />
  );
  const drawerBrand = (
    <TopBarBrand
      href="#dashboard"
      layout="panel"
      productName="openmediavault"
    />
  );

  return (
    <div data-density={density === "compact" ? "compact" : undefined}>
      <Shell
        mainId="main"
        skipLink={<SkipLink targetId="main">Skip to main content</SkipLink>}
        topBar={
          <TopBar
            brand={brand}
            navToggle={
              <IconButton
                label="Open navigation"
                icon={<MenuIcon />}
                variant="quiet"
                onClick={() => setDrawer(true)}
              />
            }
            search={
              <CommandPaletteTrigger
                label="Go to or do…"
                onClick={() => setPalette(true)}
              />
            }
            density={
              <DensityToggle
                density={density}
                onDensityChange={setDensity}
                label="Compact rows"
                hint={
                  density === "compact"
                    ? "Compact rows: on"
                    : "Compact rows: off"
                }
              />
            }
            pending={
              <PendingPill
                ref={pillRef}
                count={pending}
                applying={state === "applying"}
                label={
                  pending === 0
                    ? "No pending changes"
                    : `${pending} pending ${pending === 1 ? "change" : "changes"}`
                }
                word="pending"
                onClick={() => {
                  window.scrollTo({ top: 0 });
                  document.getElementById("pending-band")?.focus();
                }}
              />
            }
            tasks={<Tasks />}
            user={<User />}
          />
        }
        notices={
          notice ? (
            <NoticeBanner
              label="Connection notice"
              icon={<LockOpen />}
              action={
                <ExternalLink
                  href="https://nas.example.org/"
                  newTabLabel="(opens in a new tab)"
                >
                  Use a secure connection (HTTPS)
                </ExternalLink>
              }
            >
              This connection is not encrypted. Passwords you type here can be
              read by others on the network.
            </NoticeBanner>
          ) : null
        }
        pending={
          <PendingBand
            id="pending-band"
            tabIndex={-1}
            label="Pending changes"
            open={pending > 0}
            state={state}
            message={`${changes(pending)} waiting to be applied: ${MODULES.slice(0, pending).join(", ")}`}
            applyingMessage="Applying the changes… The services restart as needed."
            appliedMessage={`Applied. ${MODULES.slice(0, Math.min(pending, 3)).join(", ")} now use the new settings.`}
            failedMessage="Applying the changes failed. They are still saved and waiting. SMB could not be restarted."
            applyLabel={`Apply ${changes(pending)}`}
            undoLabel={`Undo ${changes(pending)}`}
            retryLabel="Try applying again"
            showProgress={{ label: "Show progress", onShow: () => undefined }}
            onApply={apply}
            onUndo={() => setPending(0)}
            className="outline-hidden"
          />
        }
        sidebar={<SideNav aria-label="Main navigation">{nav}</SideNav>}
        overlays={
          <>
            <SideNavDrawer
              open={drawer}
              onOpenChange={setDrawer}
              label="Main navigation"
              closeLabel="Close navigation"
              brand={drawerBrand}
            >
              {nav}
            </SideNavDrawer>
            <CommandPalette
              open={palette}
              onOpenChange={setPalette}
              items={commands}
              label="Go to or do"
              inputLabel="Search pages and actions"
              emptyMessage={(q) =>
                `Nothing matches “${q}”. Try a page name, like “disks”.`
              }
              closeLabel="Close"
              keysHint="↑ ↓ to move · Enter to go · g then a letter jumps from anywhere"
              externalLabel="classic interface"
            />
          </>
        }
      >
        <h1 className="text-title">{title}</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Save a setting to see the pending mark fly into the top bar. Press /
          for the palette, or g then d for Disks. Scroll to shrink the band into
          the pill.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={(event) => {
              const from = event.currentTarget;
              void flyPendingMark(from, pillRef.current ?? from);
              setPending((n) => Math.min(n + 1, MODULES.length));
            }}
          >
            Save sharing
          </Button>
        </div>
        <div className="mt-8 grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-40 rounded-card p-card surface-raised">
              <p className="text-section">Card {i + 1}</p>
              <p className="mt-1 text-caption text-tertiary-foreground">
                Content scrolls under the top bar, which blurs it.
              </p>
            </div>
          ))}
        </div>
      </Shell>
    </div>
  );
}

function Tasks() {
  return (
    <Menu>
      <MenuTrigger
        render={
          <IconButton
            label="Tasks: 1 running"
            icon={<ListChecks />}
            variant="quiet"
          />
        }
      />
      <MenuContent align="end" className="w-[min(22rem,calc(100vw-1rem))]">
        <MenuGroup>
          <MenuGroupLabel>Tasks</MenuGroupLabel>
          <MenuItem>
            <TaskRow
              title="Install updates"
              status="running"
              statusLabel="Running"
              elapsed="2 min 15 s"
            />
          </MenuItem>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

function User() {
  return (
    <Menu>
      <MenuTrigger
        render={
          <IconButton
            label="Account: admin"
            icon={<UserRound />}
            variant="quiet"
          />
        }
      />
      <MenuContent align="end">
        <MenuItem>Your account</MenuItem>
        <MenuSeparator />
        <MenuItem>Sign out</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The shell on a built page, nothing pending: the pill is a quiet chip. Light theme. */
export const Light: Story = {
  globals: { theme: "Light" },
  render: () => <DemoShell />,
};

/** The same in the dark theme, the first theme. */
export const Dark: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell />,
};

/** Compact density (Instrument's values on Sky's colours): a shorter bar, tighter rows. */
export const Compact: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell density="compact" pending={3} />,
};

/** At 390px the sidebar folds into the drawer, which opens on the current page's group. */
export const DrawerAt390: Story = {
  globals: { theme: "Dark", viewport: { value: "phone390", isRotated: false } },
  render: () => <DemoShell drawerOpen pending={2} />,
};

/** The phone layout with the drawer closed: the mark stands for the name, the pill for the band's count. */
export const PhoneAt390: Story = {
  globals: {
    theme: "Light",
    viewport: { value: "phone390", isRotated: false },
  },
  render: () => <DemoShell pending={1} />,
};

/**
 * Every group with the items plugins add, which stay classic and quieter. The current group is open;
 * the others fold, so the list never becomes one long column.
 */
export const ManyGroupsWithPluginItems: Story = {
  globals: { theme: "Dark" },
  render: () => (
    <DemoShell plugins page={{ group: "services", id: "wireguard" }} />
  ),
};

/** One change waiting: the band in OMV's yellow under the top bar, and the pill turned yellow. */
export const PendingOne: Story = {
  globals: { theme: "Light" },
  render: () => <DemoShell pending={1} />,
};

/** Twelve changes: the band's words wrap rather than truncate. */
export const PendingTwelve: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell pending={12} />,
};

/** Applying: the progress line runs along the band's foot; Apply and Undo wait. */
export const Applying: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell pending={3} state="applying" />,
};

/** Applied: the line is full and the band says so before it closes. */
export const Applied: Story = {
  globals: { theme: "Light" },
  render: () => <DemoShell pending={3} state="applied" />,
};

/** Failed: the band says so, offers to try again first, and never shrinks while scrolling. */
export const Failed: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell pending={3} state="failed" />,
};

/** The palette open over the shell, with the pending action first. */
export const PaletteOpen: Story = {
  globals: { theme: "Dark" },
  render: () => <DemoShell paletteOpen pending={2} />,
};

/** Without the UI-12 notice (a secure connection): the band sits directly under the top bar. */
export const SecureConnection: Story = {
  globals: { theme: "Light" },
  render: () => <DemoShell notice={false} pending={2} page="dashboard" />,
};
