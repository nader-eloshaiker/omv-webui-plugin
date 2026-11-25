// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype, the NAS map (rethink spec 8 row 1), in the lab: development only (UI-11).
// It renders in the system's own look (react-ui-components on css-ui-style) inside a static copy of
// the shell, so a screenshot shows the page itself. The query string selects what is shown and never
// acts (UI-4): screen=nas-map, state=<one of DASH_STATES>, tips=on|off, motion=full|reduced,
// theme=dark|light, density=comfortable|compact, width=full|900|390 (frames the page), still=1
// (no live sampling, for screenshots), chrome=0 hides the lab's controls and cause buttons.
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
import { FormIcon } from "../forms/FormIcon.tsx";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import "../tables/tables.css";
import "./dashboard.css";
import { Dashboard } from "./Dashboard.tsx";
import type { DashState, DashWidth } from "./states.ts";
import { DASH_STATES, DASH_WIDTHS } from "./states.ts";

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

interface View {
  state: DashState;
  tips: boolean;
  motion: "full" | "reduced";
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  width: DashWidth;
}

function readView(): View & { chrome: boolean; still: boolean } {
  const q = new URLSearchParams(window.location.search);
  return {
    state: pick(
      q.get("state"),
      DASH_STATES.map((s) => s.id),
      "needs-you",
    ),
    tips: q.get("tips") !== "off",
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    width: pick(q.get("width"), DASH_WIDTHS, "full"),
    chrome: q.get("chrome") !== "0",
    still: q.get("still") === "1",
  };
}

export default function NasMapLab() {
  const initial = useMemo(readView, []);
  const [view, setView] = useState<View>(initial);
  const [chrome, setChrome] = useState(initial.chrome);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);

  // The query string mirrors the view, so it can be reopened or screenshotted. It never acts.
  useEffect(() => {
    const q = new URLSearchParams({
      screen: "nas-map",
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
    if (initial.still) {
      q.set("still", "1");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [view, chrome, initial.still]);

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
    document.title = "Lab: Dashboard, the NAS map";
  }, [view.theme, view.density, view.motion]);

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
  // A new state or tips setting starts the page again, as a fresh reading would.
  const key = `${view.state}:${view.tips ? "t" : "n"}`;

  return (
    <UiProvider>
      <div className="omv-lab-forms omv-lab-dash" data-motion={view.motion}>
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
                <SideNavItem icon={<LayoutGrid />} current>
                  Dashboard
                </SideNavItem>
              </SideNavList>
              <SideNavGroup label="System" icon={<Settings />}>
                <SideNavItem>Web interface</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Network" icon={<Network />}>
                <SideNavItem>Interfaces</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Storage" icon={<HardDrive />}>
                <SideNavItem>Disks</SideNavItem>
                <SideNavItem>File systems</SideNavItem>
                <SideNavItem>Shared folders</SideNavItem>
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
          <div className="dm-width" data-width={view.width}>
            <Dashboard
              key={key}
              state={view.state}
              tips={view.tips}
              compact={view.density === "compact"}
              reduced={view.motion === "reduced"}
              chrome={chrome}
              still={initial.still}
              onNote={onNote}
            />
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
            <label className="lf-labbar-select">
              <span className="sr-only">State</span>
              <select
                value={view.state}
                onChange={(event) => {
                  update({
                    state: pick(
                      event.target.value,
                      DASH_STATES.map((s) => s.id),
                      "needs-you",
                    ),
                  });
                }}
              >
                {DASH_STATES.map((s) => (
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
              <FormIcon name="close" />
            </button>
          </aside>
        ) : null}
      </div>
    </UiProvider>
  );
}
