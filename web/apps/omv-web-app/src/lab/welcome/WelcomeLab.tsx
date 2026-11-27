// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard design (journal 2026-11-27, and the owner's word after it: the decisions of /ui with
// the life of the Instrument lab), the whole page from the welcome down, in the lab. Development only
// (UI-11). It renders in the system's own look inside a static copy of the shell, with the command
// palette in the top bar, and the NAS is the mock's (model.ts, reads.ts, live.ts).
//
// The query string selects what is shown and never acts (UI-4); states.ts lists it. The lab's
// controls switch the case, the state of the NAS, the point in the disk health check, tips,
// animations, theme and density, and "Play the first visit" stands for "Show me around". Under the
// page, with the controls, the design says how the welcome is dismissed, how it stays away, what
// Show me around and Show tips do, its motion and its compact form.
import type { CommandItem } from "@omv-webui/react-ui-components";
import {
  CommandPalette,
  CommandPaletteTrigger,
  MotionProvider,
  Shell,
  SideNav,
  SideNavGroup,
  SideNavItem,
  SideNavList,
  TopBar,
  TopBarBrand,
  UiProvider,
  useCommandKeys,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { FormIcon } from "../forms/FormIcon.tsx";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import type { DashProps } from "./Dashboard.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { labNas } from "./model.ts";
import type { CaseId, CheckState, WelcomeView } from "./states.ts";
import { CASES, readWelcomeView, welcomeQuery } from "./states.ts";
import "./welcome.css";
import { BEHAVIOUR, COMMON } from "./words.ts";

/** How long the lab's disk health check takes (Smart.getListBg runs as a background task). */
const CHECK_MS = 1600;

export default function WelcomeLab() {
  const initial = useMemo(() => readWelcomeView(window.location.search), []);
  const [view, setView] = useState<WelcomeView>(initial);
  const [chrome, setChrome] = useState(initial.chrome);
  const [check, setCheck] = useState<CheckState>(initial.check);
  const [landed, setLanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Each play of the first visit remounts the page; the first one runs unless still=1.
  const [run, setRun] = useState(0);
  const [assemble, setAssemble] = useState(!initial.still);
  const [palette, setPalette] = useState(false);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const { t } = useTranslation();
  const format = useFormat();

  const update = (patch: Partial<WelcomeView>) => {
    setView((v) => ({ ...v, ...patch }));
  };

  // The query string mirrors the view, so it can be reopened or screenshotted. It never acts.
  useEffect(() => {
    const q = welcomeQuery({ ...view, chrome });
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [view, chrome]);

  // Theme, density and the animations preference on <html>, so portals (the palette) follow.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", view.theme === "dark");
    root.classList.toggle("light", view.theme === "light");
    root.style.colorScheme = view.theme;
    if (view.density === "compact") {
      root.dataset.density = "compact";
    } else {
      delete root.dataset.density;
    }
    root.dataset.motion = view.motion;
    document.title = "Lab: The dashboard";
  }, [view.theme, view.density, view.motion]);

  useEffect(() => {
    if (!note) {
      return;
    }
    const id = window.setTimeout(() => {
      setNote(null);
    }, 3600);
    return () => {
      window.clearTimeout(id);
    };
  }, [note]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  const onNote = useCallback((text: string) => {
    setNote({ id: Date.now(), text: `${text} (Not part of this prototype.)` });
  }, []);

  const onCheck = useCallback(() => {
    setCheck("checking");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCheck("after");
      setLanded(true);
    }, CHECK_MS);
  }, []);

  const onHide = useCallback(() => {
    setHidden(true);
  }, []);

  // A fresh start of the same view: the welcome back, the check not done, the motion played.
  const replay = (patch: Partial<WelcomeView> = {}) => {
    window.clearTimeout(timerRef.current);
    setView((v) => ({ ...v, ...patch }));
    setHidden(false);
    setCheck(patch.check ?? "before");
    setLanded(false);
    setAssemble(true);
    setRun((r) => r + 1);
  };

  // Show me around: a later visit becomes a first visit again, the welcome back for this visit.
  const onShowAround = () => {
    replay({ case: view.case === "later" ? "existing" : view.case });
    window.scrollTo({ top: 0 });
  };

  const words = {
    kind: (kind: string) => t(`dashboard.kind.${kind as "hdd"}`),
    notChecked: t("dashboard.map.notChecked"),
    ok: t("health.ok"),
    almostFull: t("dashboard.map.storageState.warning"),
    asleep: t("dashboard.map.asleep"),
    celsius: (value: string) => t("dashboard.temps.celsius", { value }),
    speed: (mbit: number) => format.speed(mbit) ?? "",
  };
  const nas = labNas(view.case, check, words, view.nas === "needs");
  const newNas = view.case === "new";
  const welcome = view.case !== "later" && view.tips && !hidden;

  useCommandKeys({
    onOpenPalette: () => {
      setPalette(true);
    },
    jumps: {},
    enabled: !palette,
  });

  const props: DashProps = {
    nas,
    newNas,
    welcome,
    // A later visit is not a first visit: nothing assembles (Show me around makes it one).
    assemble: assemble && view.case !== "later",
    compact: view.density === "compact",
    tips: view.tips,
    still: view.still,
    check,
    landed,
    onCheck,
    onHide,
    onNote,
    onShowAround,
  };

  const items: CommandItem[] = [
    {
      id: "do.check",
      label: COMMON.check,
      group: "Do",
      keywords: ["smart", "health", "disks"],
      onSelect: onCheck,
    },
    ...(nas.facts.unused[0]
      ? [
          {
            id: "do.storage",
            label: `Add storage on ${nas.facts.unused[0].device}`,
            group: "Do",
            keywords: ["file system", "disk"],
            onSelect: () => {
              onNote("Opens Add storage.");
            },
          },
        ]
      : []),
    ...nas.folders.map((f) => ({
      id: `do.share.${f.id}`,
      label: `Share ${f.name} with Linux and Unix computers`,
      group: "Do",
      hint: "NFS",
      keywords: ["linux", "nfs"],
      onSelect: () => {
        onNote(`Opens the Linux and Unix sharing of ${f.name}.`);
      },
    })),
    {
      id: "go.folders",
      label: "Shared folders",
      group: "Go to",
      hint: "Storage",
      onSelect: () => {
        onNote("Opens Shared folders.");
      },
    },
    {
      id: "go.disks",
      label: "Disks",
      group: "Go to",
      hint: "Storage",
      onSelect: () => {
        onNote("Opens Disks.");
      },
    },
    {
      id: "go.smb",
      label: "Windows and Mac sharing",
      group: "Go to",
      hint: "SMB",
      keywords: ["smb", "samba", "windows"],
      onSelect: () => {
        onNote("Opens Windows and Mac sharing.");
      },
    },
    {
      id: "do.around",
      label: COMMON.showAround,
      group: "Do",
      onSelect: onShowAround,
    },
  ];

  return (
    <UiProvider>
      <MotionProvider reduced={view.motion === "reduced"}>
        <div
          className="omv-lab-forms omv-lab-welcome"
          data-motion={view.motion}
        >
          <Shell
            mainId="lab-main"
            topBar={
              <TopBar
                brand={
                  <TopBarBrand productName="openmediavault" hostName="nas" />
                }
                search={
                  <CommandPaletteTrigger
                    label="Go to or do…"
                    onClick={() => {
                      setPalette(true);
                    }}
                  />
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
            <Dashboard key={`${view.case}:${String(run)}`} {...props} />
            {chrome ? (
              <section className="wl-about" aria-label="About this design">
                <h2>{BEHAVIOUR.title}</h2>
                <p>{BEHAVIOUR.idea}</p>
                <ul>
                  {BEHAVIOUR.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Shell>
          <CommandPalette
            open={palette}
            onOpenChange={setPalette}
            items={items}
            label="Go to or do"
            inputLabel="Search pages and actions"
            emptyMessage={(query) => `Nothing matches "${query}".`}
            closeLabel="Close"
            keysHint="Arrow keys move, Enter goes, Escape closes."
            externalLabel="Opens in a new tab"
          />
          <p className="lf-note" role="status">
            {note ? <span key={note.id}>{note.text}</span> : null}
          </p>
          {chrome ? (
            <aside
              className="lx-labbar lf-labbar"
              aria-label="Design lab controls"
            >
              <span className="lx-labbar-tag">Lab</span>
              <Toggle
                label="State of the NAS"
                value={view.nas}
                options={[
                  ["ok", "All fine"],
                  ["needs", "Needs you"],
                ]}
                onChange={(nasState) => {
                  update({ nas: nasState });
                }}
              />
              <label className="lf-labbar-select">
                <span className="sr-only">Case</span>
                <select
                  value={view.case}
                  onChange={(event) => {
                    const next = CASES.find((c) => c.id === event.target.value);
                    if (next) {
                      replay({ case: next.id as CaseId });
                    }
                  }}
                >
                  {CASES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                label="Disk health"
                value={check === "after" ? "after" : "before"}
                options={[
                  ["before", "Not checked"],
                  ["after", "Checked"],
                ]}
                onChange={(c) => {
                  window.clearTimeout(timerRef.current);
                  setCheck(c);
                  setLanded(false);
                  update({ check: c });
                }}
              />
              <Toggle
                label="Tips"
                value={view.tips ? "on" : "off"}
                options={[
                  ["on", "Tips"],
                  ["off", "No tips"],
                ]}
                onChange={(v) => {
                  replay({ tips: v === "on" });
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
                onClick={() => {
                  replay();
                }}
              >
                Play the first visit
              </button>
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
      </MotionProvider>
    </UiProvider>
  );
}
