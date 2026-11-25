// SPDX-License-Identifier: GPL-3.0-or-later
// The form prototypes (rethink spec 8 rows 2 and 3) in the lab: development only (UI-11). They
// render in the system's own look (react-ui-components on css-ui-style), inside a static copy of
// the shell, so a screenshot shows the real thing. The query string selects what is shown and never
// acts (UI-4): screen=add-folder|add-person, state=<one of each form's states>, drives=one|several,
// https=0|1, tips=on|off, motion=full|reduced, theme=dark|light, density=comfortable|compact,
// chrome=0 hides the lab's controls.
import {
  NoticeBanner,
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
import { AddFolder } from "./AddFolder.tsx";
import { AddPerson } from "./AddPerson.tsx";
import "./forms.css";
import { LabIcon } from "./LabIcon.tsx";
import { DRIVES_ONE, DRIVES_SEVERAL } from "./model.ts";
import type { FolderState, FormScreen, PersonState } from "./states.ts";
import { FOLDER_STATES, FORM_SCREENS, PERSON_STATES } from "./states.ts";

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

interface View {
  screen: FormScreen;
  state: string;
  drives: "one" | "several";
  https: boolean;
  tips: boolean;
  motion: "full" | "reduced";
  theme: "dark" | "light";
  density: "comfortable" | "compact";
}

function readView(): View & { chrome: boolean } {
  const q = new URLSearchParams(window.location.search);
  const screen = pick(q.get("screen"), FORM_SCREENS, "add-folder");
  const states =
    screen === "add-folder"
      ? FOLDER_STATES.map((s) => s.id)
      : PERSON_STATES.map((s) => s.id);
  return {
    screen,
    state: pick(q.get("state"), states as readonly string[], "empty"),
    drives: pick(q.get("drives"), ["one", "several"] as const, "one"),
    https: q.get("https") === "1",
    tips: q.get("tips") !== "off",
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    chrome: q.get("chrome") !== "0",
  };
}

export default function FormsLab() {
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
    });
    if (view.screen === "add-folder") {
      q.set("drives", view.drives);
    }
    q.set("https", view.https ? "1" : "0");
    if (!chrome) {
      q.set("chrome", "0");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [view, chrome]);

  // Theme, density and the animations preference on <html>, so portals (the Review sheet) follow.
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
    document.title = `Lab: ${view.screen === "add-folder" ? "Add a shared folder" : "Add a person"}`;
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
  const states = view.screen === "add-folder" ? FOLDER_STATES : PERSON_STATES;
  const formKey = `${view.screen}:${view.state}:${view.drives}`;

  return (
    <UiProvider>
      <div className="omv-lab-forms" data-motion={view.motion}>
        <Shell
          mainId="lab-main"
          topBar={
            <TopBar
              brand={
                <TopBarBrand productName="openmediavault" hostName="nas" />
              }
            />
          }
          notices={
            view.https ? null : (
              <NoticeBanner label="Connection notice">
                This connection is not encrypted. Passwords and settings you
                send can be read by others on the network.
              </NoticeBanner>
            )
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
              <SideNavGroup
                label="Storage"
                icon={<HardDrive />}
                current={view.screen === "add-folder"}
              >
                <SideNavItem>Disks</SideNavItem>
                <SideNavItem>File systems</SideNavItem>
                <SideNavItem current={view.screen === "add-folder"}>
                  Shared folders
                </SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Services" icon={<Share2 />}>
                <SideNavItem>Windows and Mac (SMB)</SideNavItem>
              </SideNavGroup>
              <SideNavGroup
                label="Users"
                icon={<Users />}
                current={view.screen === "add-person"}
              >
                <SideNavItem current={view.screen === "add-person"}>
                  People
                </SideNavItem>
                <SideNavItem>Groups</SideNavItem>
              </SideNavGroup>
              <SideNavGroup label="Diagnostics" icon={<Activity />}>
                <SideNavItem>System logs</SideNavItem>
              </SideNavGroup>
            </SideNav>
          }
        >
          {view.screen === "add-folder" ? (
            <AddFolder
              key={formKey}
              state={view.state as FolderState}
              drives={view.drives === "one" ? DRIVES_ONE : DRIVES_SEVERAL}
              tips={view.tips}
              onNote={onNote}
            />
          ) : (
            <AddPerson
              key={formKey}
              state={view.state as PersonState}
              https={view.https}
              onNote={onNote}
            />
          )}
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
            <div className="lx-labbar-group" role="group" aria-label="Form">
              {FORM_SCREENS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={view.screen === s}
                  onClick={() => {
                    update({ screen: s, state: "empty" });
                  }}
                >
                  {s === "add-folder" ? "Shared folder" : "Person"}
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
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {view.screen === "add-folder" ? (
              <Toggle
                label="Drives"
                value={view.drives}
                options={[
                  ["one", "1 drive"],
                  ["several", "3 drives"],
                ]}
                onChange={(drives) => {
                  update({ drives });
                }}
              />
            ) : null}
            <Toggle
              label="Connection"
              value={view.https ? "https" : "http"}
              options={[
                ["http", "HTTP"],
                ["https", "HTTPS"],
              ]}
              onChange={(c) => {
                update({ https: c === "https" });
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

export function Toggle<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: [V, string][];
  onChange: (value: V) => void;
}) {
  return (
    <div className="lx-labbar-group" role="group" aria-label={label}>
      {options.map(([v, words]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => {
            onChange(v);
          }}
        >
          {words}
        </button>
      ))}
    </div>
  );
}
