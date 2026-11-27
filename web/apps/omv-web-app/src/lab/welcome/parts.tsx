// SPDX-License-Identifier: GPL-3.0-or-later
// The pieces the three welcome candidates share: the NAS map from the library with the catalogue's
// words, the answer with "Check disk health" placed in it, the drawing of the NAS's front (candidate
// A) and the links every welcome ends with. Development only (UI-11). Geometry from data reaches the
// stylesheet as custom properties set through the CSSOM (`useVars`), never as a style attribute
// (UI-1).
import type {
  NasLane,
  NasMapAction,
  NasMapItem,
} from "@omv-webui/react-ui-components";
import {
  Button,
  Crossfade,
  DrivePicture,
  ExternalLink,
  FirstSteps,
  Icon,
  IconBadge,
  NAS_LANES,
  NasAnswer,
  nasAnswerState,
  nasAnswerTone,
  NasMap,
  nasMapActions,
  nasMapView,
  SegmentBar,
} from "@omv-webui/react-ui-components";
import { Play } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { useNasWords } from "../../hooks/useNasWords.ts";
import { CLASSIC_HOME } from "../../navigation/navigation.ts";
import type { LabDisk, LabNas, LabStorage } from "./model.ts";
import { CHECKED_AT } from "./model.ts";
import type { CheckState } from "./states.ts";
import { useVars } from "./vars.ts";
import { COMMON, DRAWN, fill } from "./words.ts";

// ─── The map ────────────────────────────────────────────────────────────────────────────────────

function Meter({ storage }: { storage: LabStorage }) {
  const { t } = useTranslation();
  const pct = t("dashboard.now.percent", { value: storage.percent });
  const words = [
    t("dashboard.map.spaceText", {
      percent: pct,
      free: storage.freeText,
      size: storage.sizeText,
    }),
  ];
  if (storage.mark !== null) {
    words.push(
      t("dashboard.map.spaceMark", {
        mark: t("dashboard.now.percent", { value: storage.mark }),
      }),
    );
  }
  const over = storage.health !== "ok";
  if (over) {
    words.push(t("dashboard.map.spaceOver"));
  }
  return (
    <SegmentBar
      aria-label={t("dashboard.map.space", { name: storage.name })}
      size="row"
      value={storage.percent}
      mark={storage.mark}
      threshold={
        over ? { status: "warning", label: storage.healthLabel } : undefined
      }
      markLabel={
        storage.mark === null
          ? undefined
          : t("dashboard.now.percent", { value: storage.mark })
      }
      valueText={`${words.join(", ")}.`}
      figures={
        <>
          <strong>{t("dashboard.map.spaceFigures", { percent: pct })}</strong>
          {t("dashboard.map.spaceFree", { free: storage.freeText })}
        </>
      }
    />
  );
}

export interface LabMapProps {
  nas: LabNas;
  newNas: boolean;
  /** The newcomer's captions under the column headers (comfortable density only). */
  captions: boolean;
  /** The example row of a new NAS (newcomer guidance, so it follows Show tips). */
  example: boolean;
  /** Assemble on this render: the first visit, or Show me around. */
  assemble: boolean;
  check: CheckState;
  onCheck: () => void;
  /** Put Check disk health in the map's footer (it is not, where the answer holds it). */
  checkInFooter: boolean;
  /** The one filled accent on the screen is the unused row's Add storage. */
  addStorageAccent: boolean;
  tip?: ReactNode;
  onNote: (text: string) => void;
}

export function LabMap({
  nas,
  newNas,
  captions,
  example,
  assemble,
  check,
  onCheck,
  checkInFooter,
  addStorageAccent,
  tip,
  onNote,
}: LabMapProps) {
  const { t } = useTranslation();
  const words = useNasWords();
  const view = nasMapView(nas.input);
  const { footer, ghostAdds } = nasMapActions(view, []);
  const lanes: readonly NasLane[] = captions ? NAS_LANES : [];
  const open = (item: NasMapItem) => {
    onNote(`Opens ${"id" in item ? item.id : item.kind}.`);
  };
  const action = (a: NasMapAction): ReactNode => {
    switch (a) {
      case "check-health":
        return checkInFooter ? (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            loading={check === "checking"}
            onClick={onCheck}
          >
            <Icon name="check-health" size={16} />
            {check === "checking" ? COMMON.checking : COMMON.check}
          </Button>
        ) : null;
      case "add-storage":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            onClick={() => {
              onNote("Opens Add storage.");
            }}
          >
            <Icon name="file-system" mark="create" size={16} />
            {t("dashboard.map.actions.addStorage")}
          </Button>
        );
      case "add-folder":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            onClick={() => {
              onNote("Opens Add a shared folder.");
            }}
          >
            <Icon name="shared-folder" mark="create" size={16} />
            {t("dashboard.map.actions.addFolder")}
          </Button>
        );
      case "sharing":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            onClick={() => {
              onNote("Opens Sharing settings.");
            }}
          >
            {t("dashboard.map.actions.sharing")}
          </Button>
        );
      case "interfaces":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            onClick={() => {
              onNote("Opens Interfaces.");
            }}
          >
            {t("dashboard.map.actions.interfaces")}
          </Button>
        );
    }
  };
  const storageOf = (id: string) => nas.storage.find((s) => s.id === id);
  return (
    <NasMap
      view={view}
      words={words.map}
      meter={(s) => {
        const storage = storageOf(s.id);
        return storage ? <Meter storage={storage} /> : null;
      }}
      onOpen={open}
      captions={lanes}
      example={example && newNas}
      seen={!assemble}
      replay={assemble}
      tip={tip}
      addStorage={
        ghostAdds ? (
          <Button
            variant={addStorageAccent ? "primary" : "neutral"}
            size="sm"
            onClick={() => {
              onNote("Opens Add storage.");
            }}
          >
            <Icon name="file-system" mark="create" size={16} />
            {t("dashboard.map.actions.addStorage")}
          </Button>
        ) : null
      }
      actions={footer.map(action)}
    />
  );
}

// ─── The answer ─────────────────────────────────────────────────────────────────────────────────

export interface AnswerProps {
  nas: LabNas;
  check: CheckState;
  onCheck: () => void;
  /** What needs the person, worst first; the first one's reason is the answer's reason. */
  needs?: readonly { health: "warning" | "critical"; reason: string }[];
  /** The page's h1 on a later visit; an h2 under a welcome that holds the h1. */
  level: 1 | 2;
  /** `hero`: the page's one headline. `title`: under a welcome. */
  size: "hero" | "title";
  /** Check disk health takes the screen's one filled accent: nothing else is the next step. */
  accent: boolean;
  /** Something drawn at the far end of the answer's row: the small drawing of the NAS. */
  aside?: ReactNode;
  /** Under the button: the sentence of what still holds. */
  after?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

/**
 * The everyday answer, fail-closed as the library's `nasAnswerState` decides it: before the disks'
 * health is read it can only say "No problems found so far.", and "Everything is working." comes only
 * with Smart.getListBg's reply. Before that, the answer carries the check itself, as a button right
 * after the sentence that says why the check waits for a press. The words are the catalogue's, except
 * that reason, which is new.
 */
export function Answer({
  nas,
  check,
  onCheck,
  needs = [],
  level,
  size,
  accent,
  aside,
  after,
  titleRef,
  className,
}: AnswerProps) {
  const words = useNasWords();
  const state = nasAnswerState({
    reads:
      check === "checking"
        ? { ...nas.input.reads, health: "loading" }
        : nas.input.reads,
    needs,
    newNas: false,
    storage: {
      total: nas.storage.length,
      withSpace: nas.storage.filter((s) => s.health === "ok").length,
    },
    checkedAt: check === "after" ? CHECKED_AT : undefined,
  });
  const said =
    state.kind === "needs"
      ? {
          title: words.answer(false).needs(state.count),
          reason: needs[0]?.reason ?? "",
        }
      : state.kind === "ok"
        ? words.answer(false).ok(state)
        : state.kind === "reading"
          ? {
              title: words.answer(false).reading(state.waiting).title,
              reason:
                check === "checking"
                  ? COMMON.checkingReason
                  : COMMON.notCheckedReason,
            }
          : { title: "", reason: "" };
  const tone = nasAnswerTone(state);
  const Heading = level === 1 ? "h1" : "h2";
  const button =
    check === "after" ? null : (
      <Button
        variant={accent ? "primary" : "neutral"}
        size="sm"
        loading={check === "checking"}
        onClick={onCheck}
        className="wl-answer-check"
      >
        <Icon name="check-health" size={16} />
        {check === "checking" ? COMMON.checking : COMMON.check}
      </Button>
    );
  return (
    <section
      className={`wl-answer ${className ?? ""}`}
      data-size={size}
      data-tone={tone}
      aria-label={said.title}
    >
      <Crossfade
        contentKey={tone}
        aria-hidden="true"
        className="wl-answer-mark"
      >
        <svg viewBox="0 0 24 24">
          <IconBadge status={tone} cx={12} cy={12} r={10} strokeWidth={1.5} />
        </svg>
      </Crossfade>
      <div className="wl-answer-words" aria-live="polite">
        <Heading ref={titleRef} tabIndex={-1} className="wl-answer-title">
          <Crossfade contentKey={said.title} reduced="cut">
            {said.title}
          </Crossfade>
        </Heading>
        <p className="wl-answer-reason">{said.reason}</p>
        {button ? <p className="wl-answer-actions">{button}</p> : null}
        {after}
      </div>
      {aside ? <div className="wl-answer-aside">{aside}</div> : null}
    </section>
  );
}

// ─── The welcome's links ────────────────────────────────────────────────────────────────────────

export function WelcomeLinks({
  onHide,
  children,
}: {
  onHide: () => void;
  children?: ReactNode;
}) {
  return (
    <p className="wl-links">
      {children}
      <ExternalLink href={CLASSIC_HOME} newTabLabel={COMMON.newTab}>
        {COMMON.classic}
      </ExternalLink>
      <Button
        variant="plain"
        size="sm"
        aria-label={COMMON.hideName}
        onClick={onHide}
      >
        {COMMON.hide}
      </Button>
    </p>
  );
}

// ─── The NAS's front (candidate A) ──────────────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  tech?: string;
  start: number;
  span: number;
  dashed: boolean;
}

/** The bays' disks grouped, in bay order, by the drive they make. */
function groupsOf(
  bays: readonly LabDisk[],
  nas: LabNas,
  newNas: boolean,
): Group[] {
  const groups: Group[] = [];
  bays.forEach((d, i) => {
    const storage = nas.storage.find((s) => d.storage.includes(s.id));
    const id = storage ? storage.id : d.raidMember === true ? "raid" : "unused";
    const last = groups.at(-1);
    if (last && last.id === id) {
      last.span += 1;
      return;
    }
    groups.push({
      id,
      name: storage
        ? storage.name
        : id === "raid"
          ? DRAWN.raid
          : newNas
            ? DRAWN.ready
            : DRAWN.unused,
      tech: storage?.tech,
      start: i + 1,
      span: 1,
      dashed: id === "unused",
    });
  });
  return groups;
}

function Bay({
  disk,
  index,
  size,
}: {
  disk: LabDisk;
  index: number;
  size: "large" | "small";
}) {
  const ref = useVars<HTMLLIElement>({ "--i": index });
  return (
    <li ref={ref} className="wl-bay" data-kind={disk.kind}>
      <span className="wl-slot">
        <span className="wl-caddy">
          <DrivePicture
            kind={disk.kind === "usb" ? "disk" : disk.kind}
            size={size === "large" ? "large" : "tile"}
          />
          <span className="wl-handle" />
        </span>
      </span>
    </li>
  );
}

/** A disk's words under its bay: its name, its kind and size, its temperature or "Asleep". */
function BayWords({ disk, size }: { disk: LabDisk; size: "large" | "small" }) {
  return (
    <li className="wl-label">
      <span className="wl-dev">{disk.device}</span>
      {size === "large" ? (
        <>
          <span className="wl-fact wl-fact-kind">{disk.summary}</span>
          <span className="wl-fact">{disk.detail}</span>
        </>
      ) : null}
    </li>
  );
}

function GroupItem({ group, index }: { group: Group; index: number }) {
  const ref = useVars<HTMLLIElement>({
    "--start": group.start,
    "--span": group.span,
    "--i": index,
  });
  return (
    <li ref={ref} className="wl-group" data-dashed={group.dashed || undefined}>
      <span className="wl-bracket" aria-hidden="true" />
      <span className="wl-group-name">{group.name}</span>
      {group.tech ? <span className="wl-group-tech">{group.tech}</span> : null}
    </li>
  );
}

/**
 * The NAS's front, drawn from DiskMgmt.getList: one bay per disk on a SATA port, in device order (the
 * dashboard reads no bay positions, so none is claimed), each disk drawn as its kind with its name,
 * kind and size and its temperature or "Asleep"; the NVMe stick in its M.2 slot on the mainboard
 * under them, held by its socket and standoff screw as a disk is by its caddy; and
 * under the chassis, a bracket per drive spanning the disks it is made of. Decorative for assistive
 * technology except its name and words: the bays are a list, the drives a list.
 */
export function NasFront({
  nas,
  newNas,
  size,
  assemble,
  checked,
  landed = false,
}: {
  nas: LabNas;
  newNas: boolean;
  size: "large" | "small";
  assemble: boolean;
  /** The small drawing beside a later answer: whether the disks' health was read. */
  checked?: boolean;
  /** The check's result arrived while the page was open: each disk's outline joins up once. */
  landed?: boolean;
}) {
  const bays = nas.disks.filter((d) => d.kind !== "nvme");
  const board = nas.disks.filter((d) => d.kind === "nvme");
  const groups = groupsOf(bays, nas, newNas);
  const host = nas.facts.host;
  const ref = useVars<HTMLElement>({ "--n": bays.length });
  const label =
    size === "large"
      ? fill(DRAWN.picture, { host })
      : fill(DRAWN.mini, {
          host,
          state: checked ? DRAWN.miniAfter : DRAWN.miniBefore,
        });
  return (
    <figure
      ref={ref}
      className="wl-front"
      data-size={size}
      data-assemble={assemble ? "full" : undefined}
      data-checked={checked === undefined ? undefined : String(checked)}
      data-landed={landed || undefined}
      aria-label={label}
      role={size === "small" ? "img" : undefined}
    >
      <div className="wl-chassis">
        <span className="wl-chassis-name" aria-hidden="true">
          {host}
        </span>
        <ol className="wl-bays" aria-hidden="true">
          {bays.map((d, i) => (
            <Bay key={d.id} disk={d} index={i} size={size} />
          ))}
        </ol>
        {board.length > 0 ? (
          <div className="wl-board" aria-hidden={size === "small" || undefined}>
            {board.map((d) => {
              const holds = nas.storage.find((s) => d.storage.includes(s.id));
              return (
                <span key={d.id} className="wl-stick">
                  <span className="wl-m2">
                    <span className="wl-m2-board">
                      <span className="wl-m2-screw" />
                      <span className="wl-caddy">
                        <DrivePicture
                          kind="nvme"
                          size={size === "large" ? "large" : "tile"}
                          orientation="upright"
                        />
                      </span>
                      <span className="wl-m2-socket" />
                    </span>
                  </span>
                  {size === "large" ? (
                    <span className="wl-stick-words">
                      <span className="wl-dev">{d.device}</span>
                      <span className="wl-fact">
                        {DRAWN.board}, {d.summary}
                        {holds ? (
                          <>
                            {", "}
                            <strong>{holds.name}</strong>
                          </>
                        ) : null}
                      </span>
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      <ol className="wl-labels" aria-hidden={size === "small" || undefined}>
        {bays.map((d) => (
          <BayWords key={d.id} disk={d} size={size} />
        ))}
      </ol>
      {size === "large" ? (
        <ol className="wl-groups">
          {groups.map((g, i) => (
            <GroupItem key={g.id} group={g} index={i} />
          ))}
        </ol>
      ) : null}
    </figure>
  );
}

// ─── What every candidate is given ──────────────────────────────────────────────────────────────

export interface CandidateProps {
  nas: LabNas;
  newNas: boolean;
  /** The welcome is on screen: a first visit (or Show me around) with tips on, not hidden. */
  welcome: boolean;
  /** Play the first visit's motion on this render. */
  assemble: boolean;
  compact: boolean;
  tips: boolean;
  check: CheckState;
  /** The check's result just arrived on this page (it did not come with the page). */
  landed: boolean;
  onCheck: () => void;
  onHide: () => void;
  onNote: (text: string) => void;
  onShowAround: () => void;
  onOpenPalette: () => void;
}

/** The new NAS's first steps, from the library with the catalogue's words. */
export function Steps({
  accent,
  onNote,
}: {
  accent: "filled" | "outline";
  onNote: (text: string) => void;
}) {
  const { t } = useTranslation();
  const step = (id: "storage" | "folder" | "https" | "alerts") => ({
    id,
    title: t(`dashboard.steps.${id}.title`),
    detail: t(`dashboard.steps.${id}.detail`),
    actionLabel: t(`dashboard.steps.${id}.action`),
    done: false,
    onAction: () => {
      onNote(`Opens ${t(`dashboard.steps.${id}.title`)}.`);
    },
  });
  return (
    <FirstSteps
      title={t("dashboard.steps.title")}
      progress={(done, total) => t("dashboard.steps.progress", { done, total })}
      stateLabels={{
        done: t("dashboard.steps.done"),
        notDone: t("dashboard.steps.notDone"),
      }}
      steps={[step("storage"), step("folder"), step("https"), step("alerts")]}
      accent={accent}
    />
  );
}

/** The new NAS's answer when no welcome holds the page's heading: the catalogue's own. */
export function NewNasAnswer() {
  const { t } = useTranslation();
  return (
    <NasAnswer
      status="ok"
      variant="welcome"
      title={t("dashboard.answer.welcomeTitle")}
      reason={t("dashboard.answer.welcomeReason")}
    />
  );
}

/** The page's foot: where "Show me around" lives (beside This NAS on the page). */
export function Foot({ onShowAround }: { onShowAround: () => void }) {
  return (
    <p className="wl-foot">
      <Button variant="plain" size="sm" onClick={onShowAround}>
        <Play aria-hidden="true" />
        {COMMON.showAround}
      </Button>
    </p>
  );
}
