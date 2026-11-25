// SPDX-License-Identifier: GPL-3.0-or-later
// The table prototypes (rethink spec 8 rows 4 and 5) in the lab: development only (UI-11). They
// render in the system's own look (react-ui-components on css-ui-style), inside a static copy of the
// shell, so a screenshot shows the real thing. The query string selects what is shown and never acts
// (UI-4): screen=folders-table|disks-table, state=<one of each table's states>, tips=on|off,
// motion=full|reduced, theme=dark|light, density=comfortable|compact, width=full|900|390 (frames
// the page to show the list form), chrome=0 hides the lab's controls and cause buttons.
import {
  Shell,
  SideNav,
  SideNavGroup,
  SideNavItem,
  SideNavList,
  TopBar,
  TopBarBrand,
  UiProvider,
} from "@omv-webui/react-ui-components";
import {
  Activity,
  HardDrive,
  LayoutGrid,
  Network,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import { LabIcon } from "../forms/LabIcon.tsx";
import { DisksTable } from "./DisksTable.tsx";
import { FoldersTable } from "./FoldersTable.tsx";
import type {
  DiskTableState,
  FolderTableState,
  LabWidth,
  TableScreen,
} from "./states.ts";
import {
  DISK_TABLE_STATES,
  FOLDER_TABLE_STATES,
  TABLE_SCREENS,
  WIDTHS,
} from "./states.ts";
import "./tables.css";

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

interface View {
  screen: TableScreen;
  state: string;
  tips: boolean;
  motion: "full" | "reduced";
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  width: LabWidth;
}

function statesOf(screen: TableScreen) {
  return screen === "folders-table" ? FOLDER_TABLE_STATES : DISK_TABLE_STATES;
}

function readView(): View & { chrome: boolean } {
  const q = new URLSearchParams(window.location.search);
  const screen = pick(q.get("screen"), TABLE_SCREENS, "folders-table");
  return {
    screen,
    state: pick(
      q.get("state"),
      statesOf(screen).map((s) => s.id) as readonly string[],
      "populated",
    ),
    tips: q.get("tips") !== "off",
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    width: pick(q.get("width"), WIDTHS, "full"),
    chrome: q.get("chrome") !== "0",
  };
}

export default function TablesLab() {
  const initial = useMemo(readView, []);
  const [view, setView] = useState<View>(initial);
  const [chrome, setChrome] = useState(initial.chrome);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);

  // The query string mirrors the view, so it can be reopened or screenshotted. It never acts.
  useEffect(() => {
    const q = new URLSearchParams({
      screen: view.screen,
      state: view.state,
      theme: view.theme,
      density: view.density,
      tips: view.tips ? "on" : "off",
      motion: view.motion,
      width: view.width,
    });
    if (!chrome) {
      q.set("chrome", "0");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [view, chrome]);

  // Theme, density and the animations preference on <html>, so portals (menus, tooltips) follow.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", view.theme === "dark");
    root.classList.toggle("light", view.theme === "light");
    if (view.density === "compact") {
      root.dataset.density = "compact";
    } else {
      delete root.dataset.density;
    }
    root.dataset.motion = view.motion;
    document.title = `Lab: ${view.screen === "folders-table" ? "Shared folders table" : "Disks table"}`;
  }, [view.theme, view.density, view.motion, view.screen]);

  useEffect(() => {
    if (!note) {
      return;
    }
    const timer = window.setTimeout(() => {
      setNote(null);
    }, 3600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [note]);

  const onNote = (text: string) => {
    setNote({ id: Date.now(), text: `${text} (Not part of this prototype.)` });
  };
  const update = (patch: Partial<View>) => {
    setView((v) => ({ ...v, ...patch }));
  };
  const folders = view.screen === "folders-table";
  const key = `${view.screen}:${view.state}`;

  return (
    <UiProvider>
      <div className="omv-lab-forms omv-lab-tables" data-motion={view.motion}>
        <Shell
          mainId="lab-main"
          topBar={
            <TopBar
              brand={
                <TopBarBrand productName="openmediavault" hostName="nas" />
              }
            />
          }
          sidebar={
            <SideNav aria-label="Main">
              <SideNavList>
                <SideNavItem icon={<LayoutGrid />}>Dashboard</SideNavItem>
              </SideNavList>
              <SideNavGroup label="System" icon={<Settings />}>
                <SideNavItem>Web interface</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Network" icon={<Network />}>
                <SideNavItem>Interfaces</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Storage" icon={<HardDrive />} current>
                <SideNavItem current={!folders}>Disks</SideNavItem>
                <SideNavItem>File systems</SideNavItem>
                <SideNavItem current={folders}>Shared folders</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Services" icon={<Share2 />}>
                <SideNavItem>Windows and Mac (SMB)</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Users" icon={<Users />}>
                <SideNavItem>People</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Diagnostics" icon={<Activity />}>
                <SideNavItem>System logs</SideNavItem>
              </SideNavGroup>
            </SideNav>
          }
        >
          <div className="lt-width" data-width={view.width}>
            {folders ? (
              <FoldersTable
                key={key}
                state={view.state as FolderTableState}
                tips={view.tips}
                chrome={chrome}
                onNote={onNote}
              />
            ) : (
              <DisksTable
                key={key}
                state={view.state as DiskTableState}
                tips={view.tips}
                chrome={chrome}
                onNote={onNote}
              />
            )}
          </div>
        </Shell>
        <p className="lf-note" role="status">
          {note ? <span key={note.id}>{note.text}</span> : null}
        </p>
        {chrome ? (
          <aside
            className="lx-labbar lf-labbar"
            aria-label="Design lab controls"
          >
            <span className="lx-labbar-tag">Lab</span>
            <div className="lx-labbar-group" role="group" aria-label="Table">
              {TABLE_SCREENS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={view.screen === s}
                  onClick={() => {
                    update({ screen: s, state: "populated" });
                  }}
                >
                  {s === "folders-table" ? "Folders" : "Disks"}
                </button>
              ))}
            </div>
            <label className="lf-labbar-select">
              <span className="sr-only">State</span>
              <select
                value={view.state}
                onChange={(event) => {
                  update({ state: event.target.value });
                }}
              >
                {statesOf(view.screen).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label="Width"
              value={view.width}
              options={[
                ["full", "Full"],
                ["900", "900"],
                ["390", "390"],
              ]}
              onChange={(width) => {
                update({ width });
              }}
            />
            <Toggle
              label="Tips"
              value={view.tips ? "on" : "off"}
              options={[
                ["on", "Tips"],
                ["off", "No tips"],
              ]}
              onChange={(t) => {
                update({ tips: t === "on" });
              }}
            />
            <Toggle
              label="Animations"
              value={view.motion}
              options={[
                ["full", "Full"],
                ["reduced", "Reduced"],
              ]}
              onChange={(motion) => {
                update({ motion });
              }}
            />
            <Toggle
              label="Theme"
              value={view.theme}
              options={[
                ["dark", "Dark"],
                ["light", "Light"],
              ]}
              onChange={(theme) => {
                update({ theme });
              }}
            />
            <Toggle
              label="Density"
              value={view.density}
              options={[
                ["comfortable", "Comfy"],
                ["compact", "Compact"],
              ]}
              onChange={(density) => {
                update({ density });
              }}
            />
            <button
              type="button"
              className="lx-labbar-solo"
              aria-label="Hide the lab controls"
              onClick={() => {
                setChrome(false);
              }}
            >
              <LabIcon name="close" />
            </button>
          </aside>
        ) : null}
      </div>
    </UiProvider>
  );
}
