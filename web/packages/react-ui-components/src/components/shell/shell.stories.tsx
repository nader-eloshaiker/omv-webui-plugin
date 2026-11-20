// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Database,
  HardDrive,
  History,
  ListChecks,
  LockOpen,
  Menu as MenuIcon,
  Network,
  Puzzle,
  Settings,
  Share2,
  UserRound,
  Users,
} from "lucide-react";
import * as React from "react";
import { NoticeBanner } from "../banner/notice-banner";
import { PendingBanner } from "../banner/pending-banner";
import { Button, IconButton } from "../button/button";
import { ExternalLink } from "../external-link/external-link";
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
  SideNav,
  SideNavDrawer,
  SideNavGroup,
  SideNavItem,
} from "../side-nav/side-nav";
import { SkipLink } from "../skip-link/skip-link";
import { TaskRow } from "../task-row/task-row";
import { TopBar } from "../top-bar/top-bar";

const meta = {
  title: "Patterns/Shell",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;

function Pending() {
  return (
    <Button variant="onIdentity" size="sm" aria-label="3 pending changes">
      <History aria-hidden="true" />
      <span aria-hidden="true" className="tabular-nums">
        3
      </span>
      <span aria-hidden="true" className="hidden md:inline">
        pending
      </span>
    </Button>
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
            variant="onIdentity"
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
          <MenuItem>
            <TaskRow
              title="Scrub pool tank"
              status="succeeded"
              statusLabel="Succeeded"
              elapsed="41 min"
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
            variant="onIdentity"
          />
        }
      />
      <MenuContent align="end">
        <MenuItem>Settings</MenuItem>
        <MenuSeparator />
        <MenuItem>Sign out</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Groups() {
  return (
    <>
      <SideNavGroup label="System">
        <SideNavItem href="#" icon={<Settings />}>
          General settings
        </SideNavItem>
        <SideNavItem
          href="#"
          icon={<Puzzle />}
          classicOnly={{ label: "Classic" }}
        >
          Plugins
        </SideNavItem>
      </SideNavGroup>
      <SideNavGroup label="Network">
        <SideNavItem href="#" icon={<Network />}>
          Interfaces
        </SideNavItem>
      </SideNavGroup>
      <SideNavGroup label="Storage">
        <SideNavItem href="#" icon={<HardDrive />}>
          Disks
        </SideNavItem>
        <SideNavItem href="#" icon={<Database />}>
          File systems
        </SideNavItem>
        <SideNavItem href="#" icon={<Share2 />} current>
          Shared folders
        </SideNavItem>
      </SideNavGroup>
      <SideNavGroup label="Users">
        <SideNavItem
          href="#"
          icon={<Users />}
          classicOnly={{ label: "Classic" }}
        >
          Groups
        </SideNavItem>
      </SideNavGroup>
    </>
  );
}

function Bar({ onOpenNav }: { onOpenNav?: () => void }) {
  return (
    <TopBar
      productName="NAS console"
      hostName="nas.example.org"
      navToggle={
        <IconButton
          label="Open navigation"
          icon={<MenuIcon />}
          variant="onIdentity"
          onClick={onOpenNav}
        />
      }
      pending={<Pending />}
      tasks={<Tasks />}
      user={<User />}
    />
  );
}

export const TopBarOnly: Story = { render: () => <Bar /> };

export const SideNavigation: Story = {
  render: () => (
    <SideNav aria-label="Main" className="w-64">
      <Groups />
    </SideNav>
  ),
};

/**
 * The stacking rule (style guide 5.1): skip link first, then the top bar, the unencrypted-connection
 * notice (UI-12, for the whole visit), and the pending band (5.8, comes and goes). Both bands are full
 * width and in the page flow; only the top bar may be sticky.
 */
function Stack() {
  return (
    <>
      <SkipLink targetId="main">Skip to main content</SkipLink>
      <Bar />
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
        This connection is not encrypted. Passwords you type here can be read by
        others on the network.
      </NoticeBanner>
      <PendingBanner
        label="Pending changes"
        message="3 pending changes: SMB, SSH, Network"
        applyLabel="Apply 3 changes"
        undoLabel="Undo 3 changes"
        onApply={noop}
        onUndo={noop}
      />
    </>
  );
}

export const StackedUnderTheTopBar: Story = { render: () => <Stack /> };

function FullShell() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex min-h-[40rem] flex-col">
      <SkipLink targetId="main">Skip to main content</SkipLink>
      <Bar onOpenNav={() => setOpen(true)} />
      <NoticeBanner label="Connection notice" icon={<LockOpen />}>
        This connection is not encrypted. Passwords you type here can be read by
        others on the network.
      </NoticeBanner>
      <PendingBanner
        label="Pending changes"
        message="3 pending changes: SMB, SSH, Network"
        applyLabel="Apply 3 changes"
        undoLabel="Undo 3 changes"
        onApply={noop}
        onUndo={noop}
      />
      <div className="flex flex-1">
        <SideNav
          aria-label="Main"
          className="hidden w-64 shrink-0 border-e border-border lg:flex"
        >
          <Groups />
        </SideNav>
        <SideNavDrawer
          open={open}
          onOpenChange={setOpen}
          label="Navigation"
          closeLabel="Close navigation"
        >
          <Groups />
        </SideNavDrawer>
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 p-4 outline-hidden sm:p-6"
        >
          <h1 className="text-xl leading-tight font-semibold">
            Shared folders
          </h1>
          <p className="mt-2 text-muted-foreground">
            Under 1024px the navigation moves into a drawer opened from the top
            bar.
          </p>
        </main>
      </div>
    </div>
  );
}

export const FullShellResponsive: Story = { render: () => <FullShell /> };

export const ExternalAndSkipLinks: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-6">
      <SkipLink targetId="main">Skip to main content</SkipLink>
      <p className="text-muted-foreground">
        Press Tab to show the skip link at the top of the page.
      </p>
      <p>
        <ExternalLink
          href="https://www.openmediavault.org/"
          newTabLabel="(opens in a new tab)"
        >
          openmediavault project
        </ExternalLink>
      </p>
    </div>
  ),
};
