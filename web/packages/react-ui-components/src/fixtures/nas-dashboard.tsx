// SPDX-License-Identifier: GPL-3.0-or-later
// Stories only: the dashboard composed from the library's pieces, as the app's page will compose it
// (rethink 6, 6.8): the welcome, the answer, what needs you, the map, then the first steps or
// shortcuts beside This NAS. The state comes from fixtures; every figure is an input.
import { BellRing, ExternalLink, KeyRound, Lock, Play } from "lucide-react";
import * as React from "react";
import {
  AttentionList,
  type AttentionItem,
} from "../components/attention-list/attention-list";
import { Button } from "../components/button/button";
import { CapacityMeter } from "../components/capacity-meter/capacity-meter";
import {
  FactListItem,
  FactListLabel,
  FactListValue,
} from "../components/fact-list/fact-list";
import {
  FirstSteps,
  type FirstStep,
} from "../components/first-steps/first-steps";
import { Icon } from "../components/icon/icon";
import { MotionScope } from "../components/motion/motion-scope";
import { NasAnswer } from "../components/nas-answer/nas-answer";
import {
  nasAnswerState,
  nasAnswerTone,
  nasAnswerWords,
  orderAttention,
} from "../components/nas-answer/nas-answer-model";
import { WelcomeLine } from "../components/nas-answer/welcome-line";
import { NasFacts } from "../components/nas-facts/nas-facts";
import { NasMap } from "../components/nas-map/nas-map";
import {
  isNewNas,
  nasMapActions,
  nasMapView,
  type NasLane,
  type NasMapAction,
  type NasMapInput,
  type NasStorage,
} from "../components/nas-map/nas-map-model";
import { Shortcuts, ShortcutsItem } from "../components/shortcuts/shortcuts";
import { Tip } from "../components/tip/tip";
import { TipsProvider } from "../components/tip/tips-provider";
import {
  baseNas,
  diskCriticalNas,
  eightNas,
  laneFailedNas,
  loadingNas,
  manyNas,
  needsYouNas,
  newNas,
  noFoldersNas,
  SPACE,
  withFirstStorage,
  withSdbWarning,
} from "./nas-fixtures";
import { NAS_ANSWER_WORDS, NAS_MAP_WORDS } from "./nas-words";

export type DashState =
  | "all-ok"
  | "needs-you"
  | "disk-critical"
  | "new-nas"
  | "new-interface"
  | "many"
  | "eight"
  | "no-folders"
  | "loading"
  | "lane-failed";

const NBSP = "\u00a0";

function inputFor(state: DashState): NasMapInput {
  switch (state) {
    case "needs-you":
      return needsYouNas();
    case "disk-critical":
      return diskCriticalNas();
    case "new-nas":
      return newNas();
    case "many":
      return manyNas();
    case "eight":
      return eightNas();
    case "no-folders":
      return noFoldersNas();
    case "loading":
      return loadingNas();
    case "lane-failed":
      return laneFailedNas();
    case "all-ok":
    case "new-interface":
      return baseNas();
  }
}

interface Need extends AttentionItem {
  reason: string;
  about?: string;
}

const RESTART: Need = {
  id: "restart",
  health: "warning",
  healthLabel: "Warning",
  title: "The NAS needs a restart",
  detail: "Updates finish installing when it restarts.",
  reason: "The NAS needs a restart to finish installing updates.",
  actionLabel: "Restart",
};

/** What needs the person, from the same input (the app builds these from its reads). */
function needsFor(input: NasMapInput, state: DashState): Need[] {
  const needs: Need[] = [];
  for (const d of input.disks) {
    if (d.health === "warning") {
      const owner = input.storage.find((s) => d.storage.includes(s.id));
      needs.push({
        id: `disk ${d.id}`,
        health: "warning",
        healthLabel: "Warning",
        title: `Disk ${d.device} reports a problem`,
        detail: `${owner?.name ?? "Its storage"} keeps working on its other disks. Plan to replace ${d.device}.`,
        reason: `Disk ${d.device} reports a problem. ${owner?.name ?? "Its storage"} keeps working.`,
        actionLabel: "See what to do",
        about: d.id,
      });
    }
    if (d.health === "critical") {
      needs.push({
        id: `disk ${d.id}`,
        health: "critical",
        healthLabel: "Critical",
        title: `Disk ${d.device} is failing`,
        detail:
          "Data drive and the 3 shared folders on it are at risk. Copy what matters to another drive now.",
        reason: `Disk ${d.device} is failing. Copy what matters off Data drive now.`,
        actionLabel: "See what to do",
        about: d.id,
      });
    }
  }
  for (const s of input.storage) {
    if (s.health === "warning") {
      needs.push({
        id: `storage ${s.id}`,
        health: "warning",
        healthLabel: s.healthLabel,
        title: `${s.name} is almost full`,
        detail: `92${NBSP}% used, 290${NBSP}GiB left. Photos, Music and Documents are on it.`,
        reason: `${s.name} is almost full.`,
        actionLabel: "See what uses space",
        about: s.id,
      });
    }
  }
  if (state === "needs-you" || state === "disk-critical") {
    needs.push(RESTART);
  }
  if (state === "needs-you") {
    needs.push({
      id: "clock",
      health: "unknown",
      healthLabel: "Unknown",
      title: "The clocks differ by 4 days",
      detail: "Schedules and logs will show the wrong time.",
      reason: "The NAS's clock is 4 days behind this computer's.",
      actionLabel: "Check the time",
    });
  }
  return needs;
}

interface Step extends FirstStep {
  /** The map's action it offers, so the map does not offer it again. */
  offers?: NasMapAction;
  icon?: React.ReactNode;
}

const STEPS_EXISTING: Step[] = [
  {
    id: "name",
    title: "Name the NAS",
    detail: "Your computers see it as nas on your network.",
    actionLabel: "Rename",
    done: true,
  },
  {
    id: "password",
    title: "Change the factory password",
    detail: "The factory password may still work.",
    actionLabel: "Change",
    done: false,
    icon: <KeyRound />,
  },
  {
    id: "https",
    title: "Turn on secure sign-in",
    detail:
      "Then your password never crosses the network in the clear (HTTPS).",
    actionLabel: "Turn on",
    done: false,
    icon: <Lock />,
  },
  {
    id: "alerts",
    title: "Get alerts by email",
    detail:
      "The NAS writes to you when a disk starts to fail, before files are lost.",
    actionLabel: "Set up",
    done: false,
    icon: <BellRing />,
  },
];

const STEPS_NEW: Step[] = [
  {
    id: "storage",
    title: "Add storage",
    detail: "Storage is a disk made ready to keep files.",
    actionLabel: "Add storage",
    done: false,
    offers: "add-storage",
  },
  {
    id: "folder",
    title: "Add a shared folder",
    detail: "Your computers open it like any folder, for example Photos.",
    actionLabel: "Add a shared folder",
    done: false,
    offers: "add-folder",
  },
  {
    id: "person",
    title: "Add the people who use it",
    detail: "Each person signs in with their own password.",
    actionLabel: "Add a person",
    done: false,
  },
  {
    id: "password",
    title: "Change the factory password",
    detail: "The factory password may still work.",
    actionLabel: "Change",
    done: false,
    icon: <KeyRound />,
  },
];

const ACTION_WORDS: Record<
  NasMapAction,
  { label: string; icon?: React.ReactNode }
> = {
  "check-health": {
    label: "Check disk health",
    icon: <Icon name="check-health" size={16} />,
  },
  "add-storage": {
    label: "Add storage",
    icon: <Icon name="file-system" mark="create" size={16} />,
  },
  "add-folder": {
    label: "Add a shared folder",
    icon: <Icon name="shared-folder" mark="create" size={16} />,
  },
  sharing: { label: "Sharing settings" },
  interfaces: { label: "Interfaces" },
};

/** The page's meter for a storage: the library's capacity meter, until the segment bar replaces it. */
export function StoryMeter({ storage }: { storage: NasStorage }) {
  const space = SPACE[storage.id];
  const percent =
    storage.used === null
      ? ""
      : `${String(Math.round(storage.used * 100))}${NBSP}%`;
  const problem = storage.health === "warning" || storage.health === "critical";
  return (
    <CapacityMeter
      variant="compact"
      label={`${storage.name}: space used`}
      value={storage.used}
      max={1}
      valueText={
        problem
          ? `${percent} used, 290${NBSP}GiB free`
          : space
            ? `${percent} used, ${space.free} free`
            : `${percent} used`
      }
      threshold={
        problem
          ? {
              status: storage.health === "critical" ? "critical" : "warning",
              label: storage.healthLabel,
            }
          : undefined
      }
      className="sm:flex-col sm:items-stretch sm:gap-1.5 [&_p]:text-xs"
    />
  );
}

const ALL_LANES: readonly NasLane[] = [
  "disks",
  "storage",
  "folders",
  "ways",
  "network",
];

export interface DemoDashboardProps {
  state: DashState;
  /** "Show tips". */
  tips?: boolean;
  /** Whether this browser has seen the first visit (the assembly and the welcome). */
  seen?: boolean;
  /** Buttons that bring what a later reading would: a problem arriving, storage being added. */
  causes?: boolean;
  /** Motion reduced in this part of the page. */
  reduced?: boolean;
}

/** The dashboard, composed. */
export function DemoDashboard({
  state,
  tips = true,
  seen = true,
  causes = false,
  reduced = false,
}: DemoDashboardProps) {
  const [input, setInput] = React.useState(() => inputFor(state));
  const [tipsSeen, setTipsSeen] = React.useState<string[]>(() =>
    state === "new-interface" ? [] : ["tip.new-interface", "tip.trace"],
  );
  const [mapKey, setMapKey] = React.useState(0);
  const [replay, setReplay] = React.useState(false);
  const [mapSeen, setMapSeen] = React.useState(seen);
  const [arrival, setArrival] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [note, setNote] = React.useState("");

  const view = React.useMemo(() => nasMapView(input), [input]);
  const fresh = isNewNas(input);
  const steps =
    state === "new-interface"
      ? STEPS_EXISTING.map((s) => ({ ...s, done: true }))
      : fresh || state === "new-nas"
        ? STEPS_NEW.map((s) =>
            s.id === "storage" ? { ...s, done: !fresh } : s,
          )
        : STEPS_EXISTING;
  const needs = needsFor(input, state);
  const ordered = orderAttention(needs);
  const answer = nasAnswerState({
    reads: input.reads,
    needs,
    newNas: fresh,
    storage: {
      total: input.storage.length,
      withSpace: input.storage.filter((s) => s.health === "ok").length,
    },
    checkedAt: "10:31",
  });
  const words = nasAnswerWords(answer, NAS_ANSWER_WORDS, ordered[0]?.reason);
  const loading = input.reads.storage === undefined;

  const stepsLeft = steps.some((s) => !s.done);
  const stepsShown = tips && stepsLeft;
  const stepsOnTop =
    stepsShown && fresh && steps.filter((s) => s.done).length < 2;
  const elsewhere = stepsShown
    ? steps
        .filter((s) => !s.done && s.offers)
        .map((s) => s.offers as NasMapAction)
    : [];
  const { footer, ghostAdds } = nasMapActions(view, elsewhere);
  const accent =
    ordered.length > 0
      ? "needs"
      : !fresh && input.folders.length === 0 && input.reads.folders === "ok"
        ? "folders"
        : stepsShown
          ? "step"
          : fresh && ghostAdds
            ? "add-storage"
            : "none";
  const newcomer = state === "new-interface" || !mapSeen || replay;
  const captions: readonly NasLane[] =
    tips && (fresh || newcomer)
      ? ALL_LANES
      : tips && input.folders.length === 0 && input.reads.folders === "ok"
        ? ["folders"]
        : [];

  const open = (what: string) => {
    setNote(what);
  };
  const meter = (s: NasStorage) => <StoryMeter storage={s} />;
  const firstSteps = (
    <FirstSteps
      title="First steps"
      progress={(done, total) => `${String(done)} of ${String(total)} done`}
      stateLabels={{ done: "done", notDone: "not done" }}
      steps={steps}
      accent={accent === "step" ? "filled" : "outline"}
    />
  );

  const page = (
    <TipsProvider
      show={tips}
      seen={tipsSeen}
      onSeen={(id) => {
        setTipsSeen((s) => [...s, id]);
      }}
    >
      <div className="@container/page flex min-w-0 flex-col gap-11 compact:gap-6">
        {causes ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="neutral"
              size="sm"
              disabled={
                input.disks.some((d) => d.id === "sdb" && d.health !== "ok") ||
                !input.disks.some((d) => d.id === "sdb" && d.storage.length > 0)
              }
              onClick={() => {
                setInput((n) => withSdbWarning(n));
                setArrival((a) => ({ id: "sdb", n: (a?.n ?? 0) + 1 }));
              }}
            >
              A problem arrives
            </Button>
            <Button
              variant="neutral"
              size="sm"
              disabled={
                !input.disks.some((d) => d.id === "sdb" && d.health !== "ok")
              }
              onClick={() => {
                setInput(inputFor(state === "needs-you" ? "all-ok" : state));
              }}
            >
              It resolves
            </Button>
            {state === "new-nas" ? (
              <Button
                variant="neutral"
                size="sm"
                disabled={!fresh}
                onClick={() => {
                  setInput((n) => withFirstStorage(n));
                }}
              >
                Storage is added
              </Button>
            ) : null}
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                setReplay(true);
                setMapKey((k) => k + 1);
              }}
            >
              <Play aria-hidden="true" />
              Show me around
            </Button>
            {note ? (
              <p
                role="status"
                className="self-center text-sm text-muted-foreground"
              >
                {note}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-6 compact:gap-3">
          {!fresh && newcomer ? (
            <WelcomeLine
              id="tip.new-interface"
              dismissLabel="Got it"
              dismissName="Got it, hide the welcome to the new interface"
              detail="Your settings and files are the same; only the way you see them is new."
              more={{
                label: "What is different",
                items: [
                  "The menu groups are the ones you know.",
                  "Press / to go anywhere, or to run an action by name.",
                  "The map below has a row for each storage: its disks, then its shared folders and how computers reach them.",
                  "Saved changes still wait in the yellow bar until you apply them.",
                ],
              }}
              actions={
                <Button variant="ghost" size="sm">
                  Open the classic interface
                  <ExternalLink aria-hidden="true" />
                </Button>
              }
            >
              Welcome to the new interface.
            </WelcomeLine>
          ) : null}
          <NasAnswer
            status={nasAnswerTone(answer)}
            variant={answer.kind === "welcome" ? "welcome" : "status"}
            title={loading ? "Reading the NAS…" : words.title}
            reason={ordered.length > 0 ? undefined : words.reason}
            loading={loading}
          />
          {loading ? null : (
            <AttentionList
              label="What needs you"
              items={needs}
              moreLabel={(n) => `${String(n)} more`}
              fewerLabel="Show fewer"
            />
          )}
        </div>
        {stepsOnTop ? firstSteps : null}
        <NasMap
          key={mapKey}
          view={view}
          words={NAS_MAP_WORDS}
          meter={meter}
          onOpen={(item) => {
            open(`Opens the ${item.kind.replace("-", " ")}.`);
          }}
          captions={captions}
          example={tips && fresh}
          seen={mapSeen}
          onSeen={() => {
            setMapSeen(true);
          }}
          replay={replay}
          arrival={arrival}
          errors={{ disks: "The request timed out after 10 seconds." }}
          onRetry={() => {
            setInput(baseNas());
          }}
          tip={
            tips && !loading ? (
              <Tip
                id="tip.trace"
                dismissLabel="Got it"
                dismissName="Got it, hide the tip about pointing at the map"
              >
                Point at a folder, a disk or a way in to see what belongs to it.
              </Tip>
            ) : null
          }
          addStorage={
            ghostAdds ? (
              <Button
                variant={accent === "add-storage" ? "primary" : "neutral"}
                size="sm"
              >
                <Icon name="file-system" mark="create" size={16} />
                Add storage
              </Button>
            ) : null
          }
          actions={footer.map((a) => (
            <Button
              key={a}
              variant={
                a === "add-folder" && accent === "folders" ? "primary" : "ghost"
              }
              size="sm"
            >
              {ACTION_WORDS[a].icon}
              {ACTION_WORDS[a].label}
            </Button>
          ))}
        />
        <div
          className={
            stepsOnTop
              ? "flex flex-col"
              : "grid grid-cols-1 gap-x-14 gap-y-9 @min-[60rem]/page:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]"
          }
        >
          {stepsOnTop ? null : stepsShown ? (
            firstSteps
          ) : (
            <Shortcuts title="Shortcuts">
              {steps
                .filter((s) => !s.done && !s.offers)
                .map((s) => (
                  <ShortcutsItem key={s.id} icon={s.icon}>
                    {s.title}
                  </ShortcutsItem>
                ))}
              <ShortcutsItem
                icon={<Icon name="person" mark="create" size={20} />}
              >
                Add a person
              </ShortcutsItem>
              <ShortcutsItem
                icon={<Icon name="group" mark="create" size={20} />}
              >
                Add a group
              </ShortcutsItem>
              <ShortcutsItem icon={<ExternalLink />}>
                Open the classic interface
              </ShortcutsItem>
            </Shortcuts>
          )}
          <NasFacts
            title="This NAS"
            layout={stepsOnTop ? "row" : "grid"}
            action={
              <Button
                variant="plain"
                size="sm"
                onClick={() => {
                  setReplay(true);
                  setMapKey((k) => k + 1);
                }}
              >
                <Play aria-hidden="true" />
                Show me around
              </Button>
            }
          >
            <FactListItem>
              <FactListLabel>Name</FactListLabel>
              <FactListValue variant="identifier">nas</FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>Version</FactListLabel>
              <FactListValue>8.6.1-1</FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>Running for</FactListLabel>
              <FactListValue>{`5${NBSP}h 25${NBSP}min`}</FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>Time on the NAS</FactListLabel>
              <FactListValue>Thu 19 Nov, 11:50</FactListValue>
            </FactListItem>
            <FactListItem span="full">
              <FactListLabel>Updates</FactListLabel>
              <FactListValue>
                <a
                  href="#updates"
                  className="font-normal text-link underline underline-offset-3"
                >
                  33 to install
                </a>
              </FactListValue>
            </FactListItem>
            {fresh ? null : (
              <FactListItem span="full">
                <FactListLabel>Add-ons</FactListLabel>
                <FactListValue className="font-normal">
                  compose, open in the classic interface
                </FactListValue>
              </FactListItem>
            )}
          </NasFacts>
        </div>
      </div>
    </TipsProvider>
  );
  return <MotionScope reduced={reduced}>{page}</MotionScope>;
}
