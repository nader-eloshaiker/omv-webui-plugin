// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance prototype (rethink spec 8 row 8, P.3), in the lab: development only (UI-11). It
// renders in the system's own look inside a static copy of the shell, with the account menu (Theme,
// Density, Show tips, Animations) and the command palette ("Hide tips" or "Show tips") in the top
// bar.
//
// The query string selects what is shown and never acts (UI-4): screen=guidance, theme=dark|light,
// density=comfortable|compact, tips=on|off, motion=full|reduced, width=full|900|390 (frames the
// page), menu=open, toast=hide-tips (the offer, for a screenshot), still=1 (the offer stays up),
// chrome=0 hides the lab's controls and cause buttons. It seeds the view and writes no preference:
// `tips=off` shows the page with tips off while the stored "Show tips" stays as it was, until the
// person changes it. Theme, density and animations stay in the lab, as on the other prototypes.
import type { CommandItem } from "@omv-webui/react-ui-components";
import {
  CommandPalette,
  CommandPaletteTrigger,
  Shell,
  SideNav,
  SideNavGroup,
  SideNavItem,
  SideNavList,
  Toaster,
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
import { hasSeen, useSeenStore } from "../../stores/useSeenStore.ts";
import { useTipsStore } from "../../stores/useTipsStore.ts";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import "../dashboard/dashboard.css";
import { FormIcon } from "../forms/FormIcon.tsx";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import "../tables/tables.css";
import type { Density, Motion, Theme } from "./AccountMenu.tsx";
import { AccountMenu } from "./AccountMenu.tsx";
import "./guidance.css";
import { PALETTE_LABEL, PALETTE_TIP } from "./guidanceModel.ts";
import { GuidancePage } from "./GuidancePage.tsx";
import type { OfferCause } from "./parts/hideTipsOffer.ts";
import { useHideTipsOffer } from "./parts/hideTipsOffer.ts";
import { tipsCommand } from "./parts/tipsCommand.ts";
import { endTip, useCurrentTip, useShowTips } from "./parts/tipsContext.ts";
import { TipsProvider } from "./parts/TipsProvider.tsx";
import type { GuidanceView, GuidanceWidth } from "./states.ts";
import { guidanceQuery, readGuidanceView } from "./states.ts";

export default function GuidanceLab() {
  const initial = useMemo(() => readGuidanceView(window.location.search), []);
  // `tips=` seeds what is shown; the stored preference changes only when the person changes it.
  const [seed, setSeed] = useState<boolean | null>(initial.tips);
  const stored = useTipsStore((s) => s.show);
  const setShow = useCallback((show: boolean) => {
    setSeed(null);
    useTipsStore.getState().setShow(show);
  }, []);
  return (
    <UiProvider>
      <TipsProvider show={seed ?? stored} onShowChange={setShow}>
        <GuidanceScreen
          initial={initial}
          onStartOver={() => {
            setSeed(null);
          }}
        />
      </TipsProvider>
      <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
    </UiProvider>
  );
}

function GuidanceScreen({
  initial,
  onStartOver,
}: {
  initial: GuidanceView;
  onStartOver: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [density, setDensity] = useState<Density>(initial.density);
  const [motion, setMotion] = useState<Motion>(initial.motion);
  const [width, setWidth] = useState<GuidanceWidth>(initial.width);
  const [menu, setMenu] = useState(initial.menu);
  const [chrome, setChrome] = useState(initial.chrome);
  const [palette, setPalette] = useState(false);
  const [run, setRun] = useState(0);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const [show, setShow] = useShowTips();
  const current = useCurrentTip();
  const { offer, preview } = useHideTipsOffer();

  // The query string mirrors the view, so it can be reopened or screenshotted. It never acts.
  useEffect(() => {
    const q = guidanceQuery(
      {
        theme,
        density,
        motion,
        width,
        menu,
        still: initial.still,
        chrome,
      },
      show,
    );
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [theme, density, motion, width, menu, chrome, show, initial.still]);

  // Theme, density and the animations preference on <html>, so portals (menus, toasts) follow.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    if (density === "compact") {
      root.dataset.density = "compact";
    } else {
      delete root.dataset.density;
    }
    root.dataset.motion = motion;
    document.title = "Lab: Guidance";
  }, [theme, density, motion]);

  // `toast=hide-tips` shows the offer as it looks, without recording that it was made.
  const previewedRef = useRef(false);
  useEffect(() => {
    if (initial.offer && !previewedRef.current) {
      previewedRef.current = true;
      preview(
        initial.density === "compact" ? "compact" : "keys",
        initial.still,
      );
    }
  }, [initial.offer, initial.density, initial.still, preview]);

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

  const onNote = useCallback((text: string) => {
    setNote({ id: Date.now(), text: `${text} (Not part of this prototype.)` });
  }, []);

  // The first switch to compact is a pro showing themselves: offer to hide tips too.
  const chooseDensity = (next: Density) => {
    if (next === "compact" && density !== "compact") {
      offer("compact");
    }
    setDensity(next);
  };

  // Using the palette is the palette tip's first success, and doing something on the page, which
  // ends the welcome. A jump key is a pro showing themselves.
  const openPalette = (cause: OfferCause | null) => {
    endTip("tip.palette");
    if (current === "tip.new-interface") {
      endTip("tip.new-interface");
    }
    setMenu(false);
    setPalette(true);
    if (cause) {
      offer(cause);
    }
  };

  useCommandKeys({
    onOpenPalette: () => {
      openPalette("keys");
    },
    jumps: {},
    enabled: !palette,
  });

  const startOver = () => {
    useSeenStore.getState().reset();
    useTipsStore.setState({ show: true, offered: false });
    useWelcomeStore.getState().setSeen(false);
    onStartOver();
    setRun((r) => r + 1);
    setNote({ id: Date.now(), text: "Every first time is new again." });
  };

  const items: CommandItem[] = [
    {
      id: "go.dashboard",
      label: "Dashboard",
      group: "Go to",
      onSelect: () => {
        onNote("Opens the dashboard.");
      },
    },
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
      id: "go.people",
      label: "People",
      group: "Go to",
      hint: "Users",
      onSelect: () => {
        onNote("Opens People.");
      },
    },
    tipsCommand(show, setShow, "Preferences"),
    {
      id: "preference.density",
      label: density === "compact" ? "Comfortable rows" : "Compact rows",
      group: "Preferences",
      keywords: ["density", "compact", "comfortable"],
      onSelect: () => {
        chooseDensity(density === "compact" ? "comfortable" : "compact");
      },
    },
    {
      id: "preference.theme",
      label: theme === "dark" ? "Light theme" : "Dark theme",
      group: "Preferences",
      keywords: ["theme", "dark", "light"],
      onSelect: () => {
        setTheme(theme === "dark" ? "light" : "dark");
      },
    },
    {
      id: "preference.motion",
      label: motion === "full" ? "Reduce animations" : "Full animations",
      group: "Preferences",
      keywords: ["animations", "motion"],
      onSelect: () => {
        setMotion(motion === "full" ? "reduced" : "full");
      },
    },
  ];

  return (
    <div
      className="omv-lab-forms omv-lab-dash omv-lab-guidance"
      data-motion={motion}
    >
      <Shell
        mainId="lab-main"
        topBar={
          <TopBar
            brand={<TopBarBrand productName="openmediavault" hostName="nas" />}
            search={
              <PaletteTrigger
                onOpen={() => {
                  openPalette(null);
                }}
              />
            }
            user={
              <AccountMenu
                open={menu}
                onOpenChange={setMenu}
                theme={theme}
                onTheme={setTheme}
                density={density}
                onDensity={chooseDensity}
                motion={motion}
                onMotion={setMotion}
                onNote={onNote}
              />
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
        <div className="dm-width" data-width={width}>
          <GuidancePage
            key={run}
            compact={density === "compact"}
            chrome={chrome}
            onNote={onNote}
            onOpenPalette={() => {
              openPalette(null);
            }}
          />
        </div>
      </Shell>
      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        items={items}
        label="Command palette"
        inputLabel={PALETTE_LABEL}
        emptyMessage={(query) => `Nothing matches "${query}".`}
        closeLabel="Close"
        keysHint="Arrow keys move, Enter goes, Escape closes."
        externalLabel="Opens in a new tab"
      />
      <p className="lf-note" role="status">
        {note ? <span key={note.id}>{note.text}</span> : null}
      </p>
      {chrome ? (
        <aside className="lx-labbar lf-labbar" aria-label="Design lab controls">
          <span className="lx-labbar-tag">Lab</span>
          <Toggle
            label="Width"
            value={width}
            options={[
              ["full", "Full"],
              ["900", "900"],
              ["390", "390"],
            ]}
            onChange={setWidth}
          />
          <Toggle
            label="Tips"
            value={show ? "on" : "off"}
            options={[
              ["on", "Tips"],
              ["off", "No tips"],
            ]}
            onChange={(t) => {
              setShow(t === "on");
            }}
          />
          <Toggle
            label="Theme"
            value={theme}
            options={[
              ["dark", "Dark"],
              ["light", "Light"],
            ]}
            onChange={setTheme}
          />
          <Toggle
            label="Density"
            value={density}
            options={[
              ["comfortable", "Comfy"],
              ["compact", "Compact"],
            ]}
            onChange={chooseDensity}
          />
          <button type="button" className="lx-labbar-solo" onClick={startOver}>
            Start over
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
  );
}

/**
 * The palette's field in the top bar. Until the palette is first used it reads "Press / to go
 * anywhere", then "Go to or do…". It changes only words already on screen, so it does not take a
 * turn among the G2 tip lines: counting it would hold back the welcome until the palette was used.
 */
function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  const seen = useSeenStore(hasSeen("tip.palette"));
  const [show] = useShowTips();
  return (
    <span className="g-tip-slot" data-tip="tip.palette">
      <CommandPaletteTrigger
        label={show && !seen ? PALETTE_TIP : PALETTE_LABEL}
        onClick={onOpen}
      />
    </span>
  );
}
