// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel (rethink spec 8 row 7), in the lab: development only (UI-11). Every motion of
// section 7 as the reel catalogue keeps it, each with its cause, a Replay, its Full and Reduced forms
// side by side and the timing in words, plus a check that nothing is still faded 400ms after its
// cause. It renders in the system's own look inside a static copy of the shell.
//
// The query string selects what is shown and never acts (UI-4): screen=motion, theme=dark|light,
// density=comfortable|compact, motion=full|reduced (what the Animations switch shows for this
// visit; the preference is written only when the person presses the switch), width=full|900|390,
// still=1 (timed returns wait for the next cause), chrome=0 hides the lab's controls, entry=<id>
// scrolls to one entry for a screenshot.
import {
  Button,
  MotionProvider,
  SegmentedChoice,
  Shell,
  SideNav,
  SideNavGroup,
  SideNavItem,
  SideNavList,
  StatusIcon,
  TopBar,
  TopBarBrand,
  UiProvider,
  useSystemReducedMotion,
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
import { useMotionStore } from "../../stores/useMotionStore.ts";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import "../dashboard/dashboard.css";
import { FormIcon } from "../forms/FormIcon.tsx";
import "../forms/forms.css";
import { Toggle } from "../forms/FormsLab.tsx";
import "../tables/tables.css";
import { ENTRIES, LEFT_OUT } from "./entries/index.ts";
import { Entry } from "./Entry.tsx";
import "./reel.css";
import type { CheckResult, ReelSettings } from "./reel.ts";
import { ReelContext } from "./reel.ts";
import { StillContext } from "./stage.ts";
import { SECTIONS } from "./types.ts";

const WIDTHS = ["full", "900", "390"] as const;
type Width = (typeof WIDTHS)[number];
type Motion = "full" | "reduced";

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

interface View {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  width: Width;
  motion: Motion;
}

function readView(): View & {
  chrome: boolean;
  still: boolean;
  entry: string | null;
} {
  const q = new URLSearchParams(window.location.search);
  const entry = q.get("entry");
  return {
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    width: pick(q.get("width"), WIDTHS, "full"),
    motion: pick(
      q.get("motion"),
      ["full", "reduced"] as const,
      useMotionStore.getState().motion,
    ),
    chrome: q.get("chrome") !== "0",
    still: q.get("still") === "1",
    // Only an id the reel has; anything else selects nothing.
    entry: ENTRIES.some((e) => e.id === entry) ? entry : null,
  };
}

type Sweep =
  | { kind: "idle" }
  | { kind: "running"; at: number; title: string }
  | { kind: "done"; failures: CheckResult[]; checked: number };

export default function MotionLab() {
  const initial = useMemo(readView, []);
  const [view, setView] = useState<View>(initial);
  const [chrome, setChrome] = useState(initial.chrome);
  const [sweep, setSweep] = useState<Sweep>({ kind: "idle" });
  const system = useSystemReducedMotion();
  const preference = useMotionStore((s) => s.motion);
  const runnersRef = useRef(new Map<string, () => Promise<CheckResult[]>>());

  const update = (patch: Partial<View>) => {
    setView((v) => ({ ...v, ...patch }));
  };

  // The query string mirrors the view, so it can be reopened or screenshotted. It never acts.
  useEffect(() => {
    const q = new URLSearchParams({
      screen: "motion",
      theme: view.theme,
      density: view.density,
      motion: view.motion,
      width: view.width,
    });
    if (!chrome) {
      q.set("chrome", "0");
    }
    if (initial.still) {
      q.set("still", "1");
    }
    if (initial.entry) {
      q.set("entry", initial.entry);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [view, chrome, initial.still, initial.entry]);

  // Theme, density and the animations setting on <html>, so portals follow.
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
    document.title = "Lab: Motion";
  }, [view.theme, view.density, view.motion]);

  // entry=<id> only scrolls to that entry; it never presses anything.
  useEffect(() => {
    if (initial.entry) {
      document
        .getElementById(`entry-${initial.entry}`)
        ?.scrollIntoView({ block: "start" });
    }
  }, [initial.entry]);

  const register = useCallback(
    (id: string, run: (() => Promise<CheckResult[]>) | null) => {
      if (run) {
        runnersRef.current.set(id, run);
      } else {
        runnersRef.current.delete(id);
      }
    },
    [],
  );

  const fullReduced =
    system || view.motion === "reduced" || preference === "reduced";
  const fullLabel = system
    ? "Full (your system asks for reduced motion)"
    : fullReduced
      ? "Full (your setting is Reduced)"
      : "Full";
  const settings = useMemo<ReelSettings>(
    () => ({ fullReduced, fullLabel, register }),
    [fullReduced, fullLabel, register],
  );

  const checkAll = async () => {
    const failures: CheckResult[] = [];
    let checked = 0;
    for (const [at, entry] of ENTRIES.entries()) {
      const run = runnersRef.current.get(entry.id);
      if (!run) {
        continue;
      }
      setSweep({ kind: "running", at: at + 1, title: entry.title });
      const results = await run();
      checked += results.length;
      failures.push(...results.filter((r) => !r.passed));
    }
    setSweep({ kind: "done", failures, checked });
  };

  return (
    <UiProvider>
      <MotionProvider
        reduced={view.motion === "reduced" || preference === "reduced"}
      >
        <div
          className="omv-lab-forms omv-lab-dash omv-lab-tables omv-lab-reel"
          data-motion={view.motion}
        >
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
              <StillContext value={initial.still}>
                <ReelContext value={settings}>
                  <div className="rl-page">
                    <header className="rl-head">
                      <h1 className="rl-title">Motion</h1>
                      <p className="rl-lede">
                        Each motion runs when you press its cause. The Full and
                        Reduced panes run it at the same moment, and 400ms later
                        the reel checks that nothing in either pane is still
                        faded.
                      </p>
                      <div className="rl-controls">
                        <div className="rl-control">
                          <span className="rl-control-label" id="rl-anim">
                            Animations
                          </span>
                          <SegmentedChoice
                            aria-label="Animations"
                            size="sm"
                            value={view.motion}
                            options={[
                              { value: "full", label: "Full" },
                              { value: "reduced", label: "Reduced" },
                            ]}
                            onValueChange={(motion) => {
                              update({ motion });
                              useMotionStore.getState().setMotion(motion);
                            }}
                          />
                        </div>
                        <Button
                          variant="neutral"
                          size="sm"
                          onClick={() => {
                            useSeenStore.getState().reset();
                          }}
                        >
                          Forget first times
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={sweep.kind === "running"}
                          onClick={() => {
                            void checkAll();
                          }}
                        >
                          Check every motion
                        </Button>
                      </div>
                      <SweepReport sweep={sweep} total={ENTRIES.length} />
                    </header>

                    {SECTIONS.map((section) => (
                      <section
                        key={section.id}
                        className="rl-section"
                        aria-labelledby={`rl-s-${section.id}`}
                      >
                        <h2
                          id={`rl-s-${section.id}`}
                          className="rl-section-title"
                        >
                          {section.title}
                        </h2>
                        {ENTRIES.filter((e) => e.section === section.id).map(
                          (entry) => (
                            <Entry key={entry.id} def={entry} />
                          ),
                        )}
                      </section>
                    ))}

                    <section className="rl-section" aria-labelledby="rl-s-out">
                      <h2 id="rl-s-out" className="rl-section-title">
                        Left out, and why
                      </h2>
                      <ul className="rl-out">
                        {LEFT_OUT.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </ReelContext>
              </StillContext>
            </div>
          </Shell>
          {chrome ? (
            <aside
              className="lx-labbar lf-labbar"
              aria-label="Design lab controls"
            >
              <span className="lx-labbar-tag">Lab</span>
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
      </MotionProvider>
    </UiProvider>
  );
}

function SweepReport({ sweep, total }: { sweep: Sweep; total: number }) {
  return (
    <div className="rl-sweep" role="status">
      {sweep.kind === "running" ? (
        <p>
          Checking {sweep.at} of {total}: {sweep.title}.
        </p>
      ) : sweep.kind === "done" ? (
        sweep.failures.length === 0 ? (
          <p className="rl-sweep-line">
            <StatusIcon status="ok" />
            Every motion passed: after each of the {sweep.checked} causes,
            everything was fully visible 400ms later.
          </p>
        ) : (
          <>
            <p className="rl-sweep-line">
              <StatusIcon status="warning" />
              {sweep.failures.length === 1
                ? "One cause left something faded."
                : `${String(sweep.failures.length)} causes left something faded.`}
            </p>
            <ul className="rl-sweep-list">
              {sweep.failures.map((f) => (
                <li key={`${f.entry}:${f.cause}`}>
                  {f.title}, after “{f.cause}”: {f.sentence}
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}
