// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab at /ui/lab: three visual directions of the same three screens, for the owner to
// choose from (journal, 2026-11-23). Development only: main.tsx loads it behind import.meta.env.DEV,
// so a production build emits none of it (UI-11; tools/build-check looks for the "omv-lab" marker).
// The query string selects what is shown (?dir=, theme=, screen=, state=); it never acts (UI-4).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Scenario } from "./data.ts";
import { nas } from "./data.ts";
import "./lab.css";
import { freeze } from "./live.ts";
import { flyPending, pulse, viewChange, viewCommitted } from "./motion.ts";
import { Shell } from "./shell.tsx";
import type { ApplyPhase, Dir, Lab, Screen, Theme, Toast } from "./state.ts";
import { LabContext, SCREENS } from "./state.ts";

const DIRS: { id: Dir; name: string }[] = [
  { id: "instrument", name: "Instrument" },
  { id: "sky", name: "Sky" },
  { id: "atlas", name: "Atlas" },
];

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    dir: pick(
      q.get("dir"),
      ["instrument", "sky", "atlas"] as const,
      "instrument",
    ),
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    screen: pick(q.get("screen"), SCREENS, "dashboard"),
    scenario: pick(
      q.get("state"),
      ["healthy", "attention"] as const,
      "attention",
    ),
    chrome: q.get("chrome") !== "0",
    still: q.get("still") === "1",
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
  };
}

export default function LabRoot() {
  const initial = useMemo(readQuery, []);
  const [dir, setDir] = useState<Dir>(initial.dir);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [pending, setPending] = useState<string[]>(
    () => nas(initial.scenario).pendingSeed,
  );
  const [phase, setPhase] = useState<ApplyPhase>("idle");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [focusDisk, setFocusDisk] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    initial.density,
  );
  const toastId = useRef(0);
  const state = useMemo(() => nas(scenario), [scenario]);

  useEffect(() => {
    if (initial.still) {
      freeze();
    }
  }, [initial.still]);

  // A view transition waits for the new view to be in the DOM.
  useLayoutEffect(() => {
    viewCommitted();
  }, [dir, theme, screen, scenario]);

  // The query string mirrors what is shown, so a view can be reopened or screenshotted. It selects
  // a view and nothing else.
  useEffect(() => {
    const q = new URLSearchParams({ dir, theme, screen, state: scenario });
    if (!initial.chrome) {
      q.set("chrome", "0");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [dir, theme, screen, scenario, initial.chrome]);

  // The document takes the lab's theme too, so scrollbars and form controls match.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    document.title = `Lab: ${DIRS.find((d) => d.id === dir)?.name ?? ""}`;
  }, [theme, dir]);

  const toast = useCallback((text: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((list) => [...list, { id, text }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const lab: Lab = {
    dir,
    theme,
    scenario,
    screen,
    nas: state,
    pending,
    phase,
    loading,
    toasts,
    focusDisk,
    density,
    setDensity,
    go: (next, options) => {
      setFocusDisk(options?.disk ?? null);
      if (next === screen) {
        return;
      }
      const forward = SCREENS.indexOf(next) > SCREENS.indexOf(screen);
      viewChange(
        () => {
          setScreen(next);
          window.scrollTo({ top: 0 });
        },
        forward ? "forward" : "back",
      );
    },
    addPending: (what, from) => {
      const target = document.querySelector("[data-pending-target]");
      const land = () => {
        setPending((list) => (list.includes(what) ? list : [...list, what]));
        setPhase("idle");
        requestAnimationFrame(() => {
          pulse(document.querySelector("[data-pending-target]"));
        });
      };
      if (from && target) {
        void flyPending(from, target).then(land);
      } else {
        land();
      }
    },
    apply: () => {
      setPhase("applying");
      window.setTimeout(() => {
        setPhase("applied");
        window.setTimeout(() => {
          setPending([]);
          setPhase("idle");
        }, 1600);
      }, 2600);
    },
    undo: () => {
      setPending([]);
      setPhase("idle");
      toast("Changes undone. The settings are as they were.");
    },
    toast,
    dismiss: (id) => {
      setToasts((list) => list.filter((t) => t.id !== id));
    },
    notInLab: (what) => {
      toast(`${what} is not part of this prototype.`);
    },
  };

  return (
    <LabContext.Provider value={lab}>
      <Shell />
      {initial.chrome ? (
        <aside className="lx-labbar" aria-label="Design lab controls">
          <span className="lx-labbar-tag">Lab</span>
          <div className="lx-labbar-group" role="group" aria-label="Direction">
            {DIRS.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={dir === d.id}
                onClick={() => {
                  viewChange(() => {
                    setDir(d.id);
                  }, "none");
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
          <div className="lx-labbar-group" role="group" aria-label="Theme">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={theme === t}
                onClick={() => {
                  viewChange(() => {
                    setTheme(t);
                  }, "none");
                }}
              >
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
          <div
            className="lx-labbar-group"
            role="group"
            aria-label="State of the NAS"
          >
            {(["attention", "healthy"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scenario === s}
                onClick={() => {
                  viewChange(() => {
                    setScenario(s);
                    setPending(nas(s).pendingSeed);
                    setPhase("idle");
                  }, "none");
                }}
              >
                {s === "attention" ? "Needs attention" : "All OK"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="lx-labbar-solo"
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => {
                setLoading(false);
              }, 1800);
            }}
          >
            Show loading
          </button>
        </aside>
      ) : null}
    </LabContext.Provider>
  );
}
