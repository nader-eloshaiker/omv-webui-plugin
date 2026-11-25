// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: the dashboard as the NAS map (rethink spec 6, 6.8, 8 row 1). Development only (UI-11).
// Top to bottom it reads as the visit does: the answer (A), what needs you (B), the NAS itself with
// status in place (C), what is happening now (D), the add-ons, then setup and facts (E). Every region
// spans the full width or splits it in a fixed 8/4, so no region can leave a hole beside it.
//
// The first visit in this browser assembles the map row by row and brings the welcome line and the
// column captions; the browser remembers it (useWelcomeStore, a non-sensitive preference, UI-13). "Show
// me around" in This NAS plays it again. The account menu's entry for it belongs to the shell.
//
// The lab's cause buttons bring what a later reading would (a problem arriving and resolving, the
// first storage replacing its ghost, a disk going to sleep) and forget the first visit. Everything
// happens in memory; nothing is written to the backend (UI-4).
import type {
  PointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import { LabCauses } from "../tables/FoldersTable.tsx";
import { reducedMotion } from "../tables/grid.ts";
import { AddOns } from "./AddOns.tsx";
import { AnswerRegion, AreaChips, WelcomeLine } from "./Answer.tsx";
import { FirstSteps, Shortcuts, ThisNas } from "./Footer.tsx";
import { useLiveFeed } from "./liveFeed.ts";
import { useRateWords } from "./liveReadings.ts";
import { LiveLine, LiveStrip } from "./LiveStrip.tsx";
import type { AreaState, Attention, LaneId, Nas } from "./model.ts";
import {
  accentAt,
  answerOf,
  areaStates,
  LANE_TARGET,
  layoutFor,
  mapView,
  nasFor,
  needsYou,
  stepActionsShown,
  withFirstStorage,
  withoutSdbWarning,
  withPower,
  withSdbWarning,
} from "./model.ts";
import { NeedsYou } from "./NeedsYou.tsx";
import type { DashState } from "./states.ts";
import { SystemMap } from "./SystemMap.tsx";
import type { Assemble } from "./welcome.ts";
import { assembleFor } from "./welcome.ts";

const ALL_LANES: readonly LaneId[] = [
  "disks",
  "storage",
  "folders",
  "ways",
  "network",
];

function useContentWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(1100);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    setWidth(node.getBoundingClientRect().width || 1100);
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The visit, for its guidance: "first" in a browser that has not seen the dashboard, "replay" after
 * "Show me around", "later" otherwise.
 */
type Visit = "first" | "replay" | "later";

export function Dashboard({
  state,
  tips,
  compact,
  reduced,
  chrome,
  still,
  onNote,
}: {
  state: DashState;
  tips: boolean;
  compact: boolean;
  /** The lab's "Animations: Reduced", known before the preference reaches <html>. */
  reduced: boolean;
  chrome: boolean;
  still: boolean;
  onNote: (text: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const width = useContentWidth(rootRef);
  const layout = layoutFor(width);
  const [nas, setNas] = useState<Nas>(() => nasFor(state));
  const [loading, setLoading] = useState(state === "loading");
  const [retrying, setRetrying] = useState<LaneId[]>([]);
  // The lab's "new interface" state is a first visit whatever this browser remembers.
  const [visit, setVisit] = useState<Visit>(() =>
    state === "new-interface" || !useWelcomeStore.getState().seen
      ? "first"
      : "later",
  );
  const [welcome, setWelcome] = useState<"shown" | "leaving" | "gone">(() =>
    visit === "first" && tips && !nas.newNas ? "shown" : "gone",
  );
  const [traceTip, setTraceTip] = useState(visit === "first" && tips);
  const [arrival, setArrival] = useState<{ node: string; n: number } | null>(
    null,
  );
  const [mapKey, setMapKey] = useState(0);
  const [assemble, setAssemble] = useState<Assemble>(() =>
    assembleFor({
      firstVisit: visit === "first",
      reduced: reduced || reducedMotion(),
      still,
      loading: state === "loading",
    }),
  );
  // Remember the first visit in this browser, once it has been shown (UI-13: one boolean).
  useEffect(() => {
    if (visit === "first") {
      useWelcomeStore.getState().setSeen(true);
    }
  }, [visit]);

  useLiveFeed(still);
  const rate = useRateWords();

  const areas = useMemo(() => areaStates(nas), [nas]);
  const answer = useMemo(() => answerOf(nas), [nas]);
  const needs = useMemo(() => needsYou(nas), [nas]);
  const view = useMemo(() => mapView(nas), [nas]);
  const stepsLeft = nas.steps.some((s) => !s.done);
  // With tips off the steps become Shortcuts (P.3, G1). On a new NAS they move up under A until two
  // are done (6.7).
  const stepsShown = tips && stepsLeft;
  const stepsOnTop =
    stepsShown && nas.newNas && nas.steps.filter((s) => s.done).length < 2;
  const accent = accentAt(nas, stepsShown);
  const smb = nas.ways.find((w) => w.id === "smb");

  // The column captions (6.8, P.3): every column on a newcomer's visit or a new NAS (G1, G2), the
  // shared folders column alone while there are none (G1). "Show me around" asks for them, so it
  // brings them even with tips off. Compact density never shows them (owner decision 11).
  const captions: readonly LaneId[] = compact
    ? []
    : visit === "replay" || (tips && (visit === "first" || nas.newNas))
      ? ALL_LANES
      : tips && nas.folders.length === 0
        ? ["folders"]
        : [];

  const dismissWelcome = useCallback(() => {
    setWelcome((w) => (w === "shown" ? "leaving" : w));
  }, []);

  // Anything done on the page dismisses the welcome (P.2), "Got it" included; "Show me around"
  // brings it back, so pressing it does not count.
  const onPageAction = (event: PointerEvent | ReactKeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      welcome === "shown" &&
      !target.closest("[data-welcome-line], .dm-show-around")
    ) {
      dismissWelcome();
    }
  };

  const showAround = () => {
    setVisit("replay");
    setWelcome(nas.newNas ? "gone" : "shown");
    setTraceTip(false);
    setAssemble(
      assembleFor({
        firstVisit: true,
        reduced: reduced || reducedMotion(),
        still: false,
        loading,
      }),
    );
    setMapKey((k) => k + 1);
    rootRef.current?.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };

  const focusArea = useCallback((area: AreaState) => {
    const el = document.getElementById(
      area.lane ? LANE_TARGET[area.lane] : "dm-facts",
    );
    if (!el) {
      return;
    }
    el.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
    el.focus({ preventScroll: true });
    // The foundation's "Arrival": ringed twice, then nothing.
    el.removeAttribute("data-arrived-ring");
    requestAnimationFrame(() => {
      el.setAttribute("data-arrived-ring", "");
    });
    window.setTimeout(() => {
      el.removeAttribute("data-arrived-ring");
    }, 2200);
  }, []);

  // 1 to 6 move focus to an area when focus is on the page, ignored while typing (6.7).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const index = Number(event.key) - 1;
      const area = areas[index];
      if (Number.isInteger(index) && area && event.key.length === 1) {
        event.preventDefault();
        focusArea(area);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [areas, focusArea]);

  const onRetry = (lane: LaneId) => {
    setRetrying((r) => [...r, lane]);
    window.setTimeout(() => {
      setRetrying((r) => r.filter((l) => l !== lane));
      setNas((n) => ({ ...n, failed: n.failed.filter((l) => l !== lane) }));
    }, 900);
  };

  const onAct = (row: Attention) => {
    onNote(`${row.action}: opens what to do about "${row.title}".`);
  };

  const sda = nas.disks.find((d) => d.id === "d:sda");
  const hasSdb = nas.disks.some((d) => d.id === "d:sdb");
  const sdbBad = nas.disks.some((d) => d.id === "d:sdb" && d.health !== "ok");

  const live =
    compact && layout !== "narrow" ? <LiveLine loading={loading} /> : null;

  return (
    <div
      ref={rootRef}
      className="dm-page"
      data-layout={layout}
      onPointerDown={onPageAction}
      onKeyDown={onPageAction}
    >
      {chrome ? (
        <LabCauses>
          <button
            type="button"
            onClick={() => {
              useWelcomeStore.getState().setSeen(false);
              onNote(
                "This browser forgot the first visit; open the page again to see it.",
              );
            }}
          >
            Forget the first visit
          </button>
          <button
            type="button"
            onClick={() => {
              setAssemble("fade");
              setVisit("later");
              setWelcome("gone");
              setMapKey((k) => k + 1);
            }}
          >
            A later visit
          </button>
          {hasSdb ? (
            <>
              <button
                type="button"
                disabled={sdbBad || loading}
                onClick={() => {
                  setNas((n) => withSdbWarning(n));
                  setArrival((a) => ({ node: "d:sdb", n: (a?.n ?? 0) + 1 }));
                }}
              >
                A problem arrives (sdb)
              </button>
              <button
                type="button"
                disabled={!sdbBad}
                onClick={() => {
                  setNas((n) => withoutSdbWarning(n));
                }}
              >
                It resolves
              </button>
            </>
          ) : null}
          {nas.newNas ? (
            <button
              type="button"
              disabled={nas.storage.some((s) => s.id === "s:data")}
              onClick={() => {
                setNas((n) => withFirstStorage(n));
              }}
            >
              A ghost becomes real (storage added)
            </button>
          ) : null}
          {sda?.power === "awake" ? (
            <button
              type="button"
              onClick={() => {
                setNas((n) => withPower(n, "d:sda", "asleep"));
              }}
            >
              sda goes to sleep
            </button>
          ) : sda?.power === "asleep" ? (
            <button
              type="button"
              onClick={() => {
                setNas((n) => withPower(n, "d:sda", "awake"));
              }}
            >
              sda wakes
            </button>
          ) : null}
          {loading ? (
            <button
              type="button"
              onClick={() => {
                setAssemble("fade");
                setLoading(false);
              }}
            >
              The readings arrive
            </button>
          ) : null}
        </LabCauses>
      ) : null}

      {welcome !== "gone" ? (
        <WelcomeLine
          leaving={welcome === "leaving"}
          compact={compact}
          onDismiss={dismissWelcome}
          onLeft={() => {
            setWelcome("gone");
          }}
          onNote={onNote}
        />
      ) : null}

      <AnswerRegion
        answer={answer}
        loading={loading}
        welcome={nas.newNas}
        chips={
          layout === "narrow" ? null : (
            <AreaChips areas={areas} onChip={focusArea} />
          )
        }
        live={live}
      />

      {stepsOnTop ? (
        <FirstSteps
          steps={nas.steps}
          filled={accent === "step"}
          placement="top"
          compact={compact}
          onNote={onNote}
        />
      ) : null}

      {loading ? null : <NeedsYou list={needs} onAct={onAct} />}

      <SystemMap
        key={mapKey}
        nas={nas}
        view={view}
        layout={layout}
        loading={loading}
        accent={accent}
        assemble={assemble}
        captions={captions}
        arrival={arrival}
        showTraceTip={traceTip && welcome === "gone" && tips && !loading}
        onTraced={() => {
          setTraceTip(false);
        }}
        onDismissTip={() => {
          setTraceTip(false);
        }}
        stepActions={stepActionsShown(nas.steps, stepsShown)}
        retrying={retrying}
        onRetry={onRetry}
        onNote={onNote}
        rate={rate}
      />

      {live ? null : (
        <LiveStrip
          loading={loading}
          layout={layout}
          connections={smb?.on ? smb.connections : null}
        />
      )}

      {loading ? null : (
        <AddOns
          nas={nas}
          fit={layout === "wide" ? 4 : layout === "mid" ? 3 : 1}
          onNote={onNote}
        />
      )}

      <div
        className="dm-foot"
        data-layout={layout}
        data-single={(stepsShown && stepsOnTop) || undefined}
      >
        {stepsShown && !stepsOnTop ? (
          <FirstSteps
            steps={nas.steps}
            filled={accent === "step"}
            placement="foot"
            compact={compact}
            onNote={onNote}
          />
        ) : stepsShown ? null : (
          <Shortcuts onNote={onNote} />
        )}
        <ThisNas facts={nas.facts} onNote={onNote} onShowAround={showAround} />
      </div>
    </div>
  );
}
