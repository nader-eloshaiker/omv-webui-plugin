// SPDX-License-Identifier: GPL-3.0-or-later
// The start page as a map of the NAS (rethink 6, 6.8; the library's composed reference,
// react-ui-components fixtures/nas-dashboard.tsx; the lab's dashboard). Is the NAS fine, and if not,
// what needs the person? Top to bottom, which is also the reading and focus order at every width:
//
//   1. the welcome line, on a first visit to the new interface or after "Show me around";
//   2. the answer, one sentence and its reason (the page's h1);
//   3. what needs you, worst first;
//   4. the first steps here, on a new NAS with fewer than two done;
//   5. the NAS map: a row per storage with its disks and shared folders, then the ways in and the
//      network;
//   6. "Right now" and the disk temperatures;
//   7. the first steps, or the Shortcuts, beside This NAS.
//
// Every region sits on the page ground, parted by space and its heading; none is a card (style guide
// 10). Pending changes are not repeated here: the band and the top bar say it.
//
// What the page reads is decided by the journal (2026-11-27) and listed in useDashboardReads.ts. A
// normal user, who gets only the time and the host name, sees those and the way to their account, and
// the page makes none of the administrator's reads (no storage, disks, kinds, services, network or
// live samples). Fail closed: a read that failed or has not arrived can never make the answer
// "Everything is working" (the library's nasAnswerState, with each read's own state). A failed poll
// never blanks what was read; "Try again" is a foreground read.
import type {
  Role,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { getSystemGetInformationQueryOptions } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AttentionList,
  Button,
  CapacityMeter,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ExternalLink,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  FirstSteps,
  Icon,
  isNewNas,
  NAS_LANES,
  NasAnswer,
  nasAnswerState,
  nasAnswerTone,
  nasAnswerWords,
  NasFacts,
  NasFront,
  NasMap,
  nasMapActions,
  nasMapView,
  orderAttention,
  Panel,
  panelClass,
  ScanLine,
  SegmentBar,
  Shortcuts,
  ShortcutsItem,
  Tip,
  useTips,
  type NasLane,
  type NasMapAction,
  type NasMapItem,
  type NasReads,
  type NasStorage,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink as ExternalIcon, Play } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  attentionRows,
  missingFileSystems,
  storageItems,
} from "../../dashboard/dashboard.ts";
import {
  DASHBOARD_TARGETS,
  nasFrontParts,
  scanAreas,
} from "../../dashboard/nasFront.ts";
import {
  nasModel,
  readStateOf,
  temperatureGroups,
  worstRead,
  type StorageFacts,
} from "../../dashboard/nasModel.ts";
import { isDiskName } from "../../disks/diskWords.ts";
import { addressIn } from "../../filesystems/fsModel.ts";
import { formatBytes } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useAttentionItems } from "../../hooks/useAttentionItems.tsx";
import { useDashboardReads } from "../../hooks/useDashboardReads.ts";
import {
  useFirstSteps,
  type DashboardStep,
} from "../../hooks/useFirstSteps.tsx";
import { useDashboardFirstVisit } from "../../hooks/useFirstTime.ts";
import { useNasFrontWords } from "../../hooks/useNasFront.tsx";
import { useNasWords } from "../../hooks/useNasWords.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { CLASSIC, CLASSIC_HOME } from "../../navigation/navigation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { MAIN_ID } from "../../shell/ids.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { usePageFocus } from "../../shell/pageFocus.ts";
import {
  askShowAround,
  showAround,
  showAroundPlayed,
} from "../../shell/showAround.ts";
import { useDensityStore } from "../../stores/useDensityStore.ts";
import { useTipsStore } from "../../stores/useTipsStore.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { DashboardLive } from "../organisms/DashboardLive.tsx";
import { DashboardTemperatures } from "../organisms/DashboardTemperatures.tsx";

export function DashboardPage() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return session.role === "admin" ? (
    <AdminDashboard username={session.username} />
  ) : (
    <UserDashboard username={session.username} role={session.role} />
  );
}

/** A foreground read of System.getInformation, for "Try again". */
function useReadAgain() {
  const queryClient = useQueryClient();
  return () => {
    queryClient
      .fetchQuery({ ...getSystemGetInformationQueryOptions(), staleTime: 0 })
      .catch(() => undefined);
  };
}

/**
 * When the first steps go (hidden here, or by another administrator and seen on the next poll) and
 * focus was inside them, focus moves to the page title rather than being lost.
 */
function useFocusTitleWhenGone(visible: boolean) {
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      const id = window.setTimeout(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          document.querySelector<HTMLElement>(`#${MAIN_ID} h1`)?.focus();
        }
      }, 0);
      wasVisibleRef.current = visible;
      return () => window.clearTimeout(id);
    }
    wasVisibleRef.current = visible;
    return undefined;
  }, [visible]);
}

/**
 * The tab's name, and focus on the answer after a navigation, as PageTitle does for the other pages:
 * on this page the answer is the one h1.
 */
function useAnswerTitle() {
  const { t } = useTranslation();
  const ref = useRef<HTMLHeadingElement>(null);
  const focus = usePageFocus();
  useEffect(() => {
    document.title = t("app.documentTitle", { page: t("dashboard.title") });
  }, [t]);
  useEffect(() => {
    if (focus.navigated()) {
      ref.current?.focus();
    }
  }, [focus]);
  return ref;
}

const ALL_LANES: readonly NasLane[] = NAS_LANES;

const errorText = (error: unknown): string | undefined =>
  isRpcError(error) ? error.message : undefined;

/** The storage's meter: the segment bar with a reading, the capacity meter while there is none. */
function StorageMeter({
  storage,
  facts,
  loading,
}: {
  storage: NasStorage;
  facts: StorageFacts | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const name = t("dashboard.map.space", { name: storage.name });
  const percent = facts?.percent ?? null;
  if (loading || facts === undefined || percent === null) {
    return (
      <CapacityMeter
        variant="compact"
        label={name}
        value={null}
        max={100}
        loading={loading}
        valueText={
          loading
            ? t("dashboard.map.spaceReading")
            : t("dashboard.map.spaceNone")
        }
      />
    );
  }
  const used = Math.min(100, Math.max(0, percent));
  const over = facts.mark !== null && used >= facts.mark;
  const pct = t("dashboard.now.percent", { value: Math.round(used) });
  const free = facts.available === null ? null : formatBytes(facts.available);
  const words = [
    facts.size === null || free === null
      ? t("dashboard.map.spaceFigures", { percent: pct })
      : t("dashboard.map.spaceText", {
          percent: pct,
          free,
          size: formatBytes(facts.size),
        }),
  ];
  if (facts.mark !== null) {
    words.push(
      t("dashboard.map.spaceMark", {
        mark: t("dashboard.now.percent", { value: facts.mark }),
      }),
    );
  }
  if (over) {
    words.push(t("dashboard.map.spaceOver"));
  }
  return (
    <SegmentBar
      aria-label={name}
      size="row"
      value={used}
      mark={facts.mark}
      markLabel={
        facts.mark === null
          ? undefined
          : t("dashboard.now.percent", { value: facts.mark })
      }
      threshold={
        over
          ? {
              status: facts.state === "critical" ? "critical" : "warning",
              label: storage.healthLabel,
            }
          : undefined
      }
      valueText={`${words.join(", ")}.`}
      figures={
        <>
          <strong>{t("dashboard.map.spaceFigures", { percent: pct })}</strong>
          {free === null ? null : t("dashboard.map.spaceFree", { free })}
        </>
      }
    />
  );
}

function AdminDashboard({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const words = useNasWords();
  const tips = useTips();
  const titleRef = useAnswerTitle();
  const welcomeId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const r = useDashboardReads();
  const readAgain = useReadAgain();
  const compact = useDensityStore((s) => s.density === "compact");
  const showTips = useTipsStore((s) => s.show);

  // The first visit in this browser (owner decision 10): the map assembles once, and the welcome and
  // the captions come for that visit. The page keeps its own copy, since the flag is set as soon as
  // the map has assembled. "Show me around" (here, or in the account menu) replays it.
  const firstVisit = useDashboardFirstVisit();
  const [newcomerVisit] = useState(firstVisit.first);
  const asked = useMemoryStore(showAround).asked;
  const [played] = useState(() => showAround.getState().played);
  useEffect(() => showAroundPlayed, []);
  const replays = asked - played;
  const replay = replays > 0;
  const newcomer = newcomerVisit || replay;

  const info = r.info.data;
  const pending = pendingModules(info?.dirtyModules);
  const check = r.check;
  const result = check.result;

  const poolsRead =
    r.zfsPlugin === "missing"
      ? "ok"
      : r.zfsPlugin === "checking"
        ? "loading"
        : readStateOf(r.pools);
  const reads: NasReads = {
    disks: readStateOf(r.diskList),
    storage: worstRead(
      readStateOf(r.mounted),
      readStateOf(r.configured),
      poolsRead,
    ),
    folders: readStateOf(r.folders),
    ways: worstRead(
      readStateOf(r.services),
      readStateOf(r.smb),
      readStateOf(r.nfs),
    ),
    network: readStateOf(r.network),
    system: readStateOf(r.info),
    ...(check.checking
      ? { health: "loading" as const }
      : result !== undefined
        ? { health: "ok" as const }
        : check.failed
          ? { health: "failed" as const }
          : {}),
  };

  const { input, facts } = nasModel(
    {
      disks: r.diskList.data?.data,
      kinds: r.kinds,
      health: result?.list.data,
      mounted: r.mounted.data,
      configured: r.configured.data?.data,
      pools: r.zfsPlugin === "missing" ? null : r.pools.data,
      poolDevices: r.poolDevices,
      folders: r.folders.data?.data,
      smb: r.smb.data?.data,
      nfs: r.nfs.data?.data,
      services: r.services.data?.data,
      interfaces: r.network.data?.data,
      reads,
    },
    words.model,
  );
  const view = nasMapView(input);
  const newNas = isNewNas(input);

  // What needs you: the dashboard model's rows, as the library's attention rows. The hot disks' row
  // reads the temperatures' own readings, so the two never disagree.
  const configured = r.configured.data?.data ?? [];
  const temperatures = temperatureGroups(
    r.diskList.data?.data ?? [],
    r.kinds,
    r.smart.data?.tempmax ?? 0,
    r.zfsPlugin === "missing" ? null : r.pools.data,
    r.poolDevices,
    configured.map((f) => ({ devicename: f.devicename, label: f.label })),
  );

  const storage =
    r.mounted.data === undefined
      ? undefined
      : storageItems(
          r.mounted.data,
          missingFileSystems(configured),
          (fs) => addressIn(configured, fs),
          r.zfsPlugin === "installed",
        );
  const rows = attentionRows({
    info,
    receivedAtMs: r.info.dataUpdatedAt,
    storage,
    disks: result
      ? { devices: result.list.data, readAt: result.readAt }
      : undefined,
    services: r.services.data?.data,
    pending,
    pools: r.pools.data,
    temperatures: temperatures.flatMap((g) => g.disks),
  });
  const needs = useAttentionItems(rows);
  const ordered = orderAttention(needs);

  const answer = nasAnswerState({
    reads,
    needs,
    newNas,
    storage: {
      total: input.storage.length,
      withSpace: input.storage.filter((s) => s.health === "ok").length,
    },
    checkedAt: result === undefined ? undefined : format.clock(result.readAt),
  });
  const said = nasAnswerWords(answer, words.answer(check.checking));
  // The first reading of the storage, which the answer, what needs you and the first steps rest on,
  // has not arrived: the answer is a placeholder and nothing else claims anything yet.
  const loading = r.mounted.data === undefined && !r.mounted.isError;

  // The first steps, or the Shortcuts (P.3: with tips off, or when every step is done).
  const first = useFirstSteps({
    info,
    username,
    newNas,
    hasStorage: input.storage.some((s) => !s.system),
    hasFolders: input.folders.length > 0,
  });
  const stepsLeft = first.steps.some((s) => !s.done);
  const stepsShown = showTips && first.eligible && stepsLeft && !loading;
  const stepsOnTop =
    stepsShown && newNas && first.steps.filter((s) => s.done).length < 2;
  useFocusTitleWhenGone(stepsShown);
  const elsewhere: NasMapAction[] = stepsShown
    ? first.steps.flatMap((s) => (!s.done && s.offers ? [s.offers] : []))
    : [];
  const { footer, ghostAdds } = nasMapActions(view, elsewhere);
  const noFolders =
    !newNas && input.folders.length === 0 && reads.folders === "ok";
  const accent =
    ordered.length > 0
      ? "needs"
      : noFolders
        ? "folders"
        : stepsShown
          ? "step"
          : newNas && ghostAdds
            ? "add-storage"
            : "none";

  // The column captions (6.8, P.3): every column for a newcomer or on a new NAS, the shared folders
  // alone while there are none. "Show me around" asks for them whatever "Show tips" says. Compact
  // density never shows them (owner decision 11).
  const captions: readonly NasLane[] = compact
    ? []
    : replay || (showTips && (newcomer || newNas))
      ? ALL_LANES
      : showTips && noFolders
        ? ["folders"]
        : [];

  const failed = (lane: NasLane) => reads[lane] === "failed";
  const laneErrors: Partial<Record<NasLane, ReactNode>> = {
    ...(failed("disks") ? { disks: errorText(r.diskList.error) } : {}),
    ...(failed("storage")
      ? {
          storage: errorText(
            r.mounted.error ?? r.configured.error ?? r.pools.error,
          ),
        }
      : {}),
    ...(failed("folders") ? { folders: errorText(r.folders.error) } : {}),
    ...(failed("ways")
      ? { ways: errorText(r.services.error ?? r.smb.error ?? r.nfs.error) }
      : {}),
    ...(failed("network") ? { network: errorText(r.network.error) } : {}),
  };
  const retrying = ALL_LANES.filter((lane) => failed(lane) && r.fetching[lane]);

  const open = (item: NasMapItem) => {
    switch (item.kind) {
      case "disk":
        if (isDiskName(item.id)) {
          void navigate({
            to: "/storage/disks/$disk",
            params: { disk: item.id },
          });
        }
        return;
      case "strip":
        void navigate({ to: "/storage/disks" });
        return;
      case "storage": {
        const where = facts.get(item.id)?.open;
        if (where?.kind === "pool" && isPoolAddress(where.pool)) {
          void navigate({
            to: "/storage/zfs/pools/$pool",
            params: { pool: where.pool },
          });
          return;
        }
        const address =
          where?.kind === "fs" ? addressIn(configured, where.fs) : null;
        if (address !== null) {
          void navigate({
            to: "/storage/filesystems/$fs",
            params: { fs: address },
          });
          return;
        }
        void navigate({ to: "/storage/filesystems" });
        return;
      }
      case "folder":
        void navigate({
          to: "/storage/shared-folders/$folder",
          params: { folder: item.id },
        });
        return;
      case "more-folders":
        void navigate({ to: "/storage/shared-folders" });
        return;
      case "more-rows":
        void navigate({ to: "/storage/filesystems" });
        return;
      case "add-storage":
        void navigate({ to: "/storage/filesystems/add" });
        return;
      case "way":
        switch (item.id) {
          case "smb":
            void navigate({ to: "/services/smb" });
            return;
          case "nfs":
            void navigate({ to: "/services/nfs" });
            return;
          case "rsync":
            void navigate({ to: "/services/rsync/server" });
            return;
          case "ssh":
            void navigate({ to: "/services/ssh" });
            return;
        }
        return;
      case "interface":
        void navigate({
          to: "/network/interfaces/$iface",
          params: { iface: item.id },
        });
        return;
    }
  };

  const action = (a: NasMapAction): ReactNode => {
    const primary = a === "add-folder" && accent === "folders";
    switch (a) {
      case "check-health":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            loading={check.checking}
            onClick={check.start}
          >
            <Icon name="check-health" size={16} />
            {check.checking
              ? t("dashboard.map.actions.checking")
              : t("dashboard.map.actions.checkHealth")}
          </Button>
        );
      case "add-storage":
        return (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            render={<Link to="/storage/filesystems/add" />}
          >
            <Icon name="file-system" mark="create" size={16} />
            {t("dashboard.map.actions.addStorage")}
          </Button>
        );
      case "add-folder":
        return (
          <Button
            key={a}
            variant={primary ? "primary" : "ghost"}
            size="sm"
            render={<Link to="/storage/shared-folders/add" />}
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
            render={<Link to="/services/smb" />}
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
            render={<Link to="/network/interfaces" />}
          >
            {t("dashboard.map.actions.interfaces")}
          </Button>
        );
    }
  };

  // The welcome (journal 2026-11-27, the dashboard design): on the first visit in this browser, or
  // after "Show me around", the NAS greeted by name with its own figures, drawn large beside the
  // greeting. It ends only with "Hide the welcome" (a change to rethink P.2: pointing at or using
  // the page leaves it), and "Show tips" off keeps it away unless "Show me around" asked for it.
  const host = info?.hostname;
  const welcome =
    newcomer &&
    !loading &&
    host !== undefined &&
    (showTips || replay) &&
    !tips.isSeen("tip.new-interface");
  const hideWelcome = () => {
    tips.endTip("tip.new-interface");
  };
  const fw = useNasFrontWords();
  const front = nasFrontParts(input, newNas, fw.front);
  // The small drawing beside the answer joins its outlines up when the check's result arrives on
  // this page, never for a result that came with it.
  const [resultAtStart] = useState(result !== undefined);
  const landed = result !== undefined && !resultAtStart;

  const showMeAround = () => {
    askShowAround();
    rootRef.current?.scrollIntoView?.({ block: "start" });
  };

  // "Check disk health" sits in the answer, right after the sentence that says why it waits, on an
  // existing NAS; it takes the filled accent only when nothing else is the next step. A new NAS
  // keeps it in the map's footer.
  const checkButton =
    newNas || result !== undefined || loading ? undefined : (
      <Button
        variant={accent === "none" ? "primary" : "neutral"}
        size="sm"
        loading={check.checking}
        onClick={check.start}
      >
        <Icon name="check-health" size={16} />
        {check.checking
          ? t("dashboard.map.actions.checking")
          : t("dashboard.map.actions.checkHealth")}
      </Button>
    );
  const mapActions = newNas
    ? footer
    : footer.filter((a) => a !== "check-health");

  // What still holds on a later visit, under the answer, while tips are on: each phrase opens its
  // page, and the sentence goes when nothing is left.
  const unusedDisk = input.disks.find(
    (d) =>
      d.storage.length === 0 && d.raidMember !== true && reads.storage === "ok",
  );
  const unreached = input.folders.find(
    (f) => f.ways.length === 0 && reads.ways === "ok",
  );
  const also =
    showTips && !welcome && !newNas && (unusedDisk || unreached) ? (
      <p className="mt-3 text-body text-muted-foreground">
        {
          t("dashboard.also.sentence", { list: "{{list}}" }).split(
            "{{list}}",
          )[0]
        }
        {unusedDisk ? (
          <Link
            to="/storage/filesystems/add"
            className="text-link underline underline-offset-3"
          >
            {t("dashboard.also.unused", { device: unusedDisk.device })}
          </Link>
        ) : null}
        {unusedDisk && unreached ? t("dashboard.also.or") : null}
        {unreached ? (
          <Link
            to="/storage/shared-folders/$folder"
            params={{ folder: unreached.id }}
            className="text-link underline underline-offset-3"
          >
            {t("dashboard.also.unreached", { folder: unreached.name })}
          </Link>
        ) : null}
        {
          t("dashboard.also.sentence", { list: "{{list}}" }).split(
            "{{list}}",
          )[1]
        }
      </p>
    ) : undefined;

  const firstSteps = (layout: "list" | "across") => (
    <div className="flex min-w-0 flex-col gap-2">
      <FirstSteps
        title={t("dashboard.steps.title")}
        progress={(done, total) =>
          t("dashboard.steps.progress", { done, total })
        }
        stateLabels={{
          done: t("dashboard.steps.done"),
          notDone: t("dashboard.steps.notDone"),
        }}
        steps={first.steps}
        accent={accent === "step" ? "filled" : "outline"}
        layout={layout}
      />
      {first.hideable ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="plain" size="sm" onClick={first.hiding.start}>
            {t("checklist.hide")}
          </Button>
          <span className="text-caption text-tertiary-foreground">
            {t("checklist.hideHint")}
          </span>
        </p>
      ) : null}
    </div>
  );

  const shortcut = (s: DashboardStep) => (
    <ShortcutsItem
      key={s.id}
      icon={s.icon}
      render={s.render}
      onClick={s.onAction}
    >
      {s.title}
      {s.external ? <span className="sr-only"> {t("app.newTab")}</span> : null}
    </ShortcutsItem>
  );

  // Every region takes the whole row, on its own ground (the journal's dashboard design): what the
  // person acts on, then what they watch, then what they look up. The welcome and the answer stand
  // on the page ground; "Right now", the temperatures and the lists at the foot on raised panels;
  // the map on its plate.
  return (
    <div
      ref={rootRef}
      className="@container/page flex min-w-0 flex-col gap-(--density-gutter)"
    >
      {welcome ? (
        <section
          data-welcome=""
          aria-labelledby={welcomeId}
          className="grid items-center gap-8 pb-4 @min-[60rem]/page:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @min-[60rem]/page:gap-x-14"
        >
          <div className="min-w-0">
            <h1
              id={welcomeId}
              ref={titleRef}
              tabIndex={-1}
              className="text-hero text-balance text-foreground outline-none"
            >
              {fw.welcome.title(host)}
            </h1>
            <p className="mt-4.5 max-w-[34rem] text-xl text-pretty text-foreground compact:mt-2 compact:text-section">
              {newNas
                ? fw.welcome.newLead(
                    input.disks.length,
                    front.groups
                      .filter((g) => g.dashed === true)
                      .reduce((n, g) => n + g.span, 0),
                  )
                : fw.welcome.existingLead(
                    input.disks.length,
                    input.storage.length,
                    input.folders.length,
                  )}
            </p>
            <p className="mt-3 max-w-[34rem] text-body text-pretty text-muted-foreground compact:hidden">
              {newNas ? fw.welcome.newMore : fw.welcome.existingMore(host)}
            </p>
            <p className="mt-5.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 compact:mt-3">
              <ExternalLink href={CLASSIC_HOME} newTabLabel={t("app.newTab")}>
                {t("dashboard.welcome.classic")}
              </ExternalLink>
              <Button
                variant="plain"
                size="sm"
                className="-ms-2.5"
                aria-label={t("dashboard.welcome.hideName")}
                onClick={hideWelcome}
              >
                {t("dashboard.welcome.hide")}
              </Button>
            </p>
          </div>
          <NasFront
            key={replays}
            host={host}
            bays={front.bays}
            board={front.board}
            groups={front.groups}
            size="large"
            label={fw.welcome.picture(host)}
            assemble
          />
        </section>
      ) : null}

      <div className="flex min-w-0 flex-col gap-(--density-gutter)">
        {newNas && welcome ? null : (
          <NasAnswer
            titleRef={welcome ? undefined : titleRef}
            headingLevel={welcome ? 2 : 1}
            size={welcome ? "title" : "hero"}
            status={nasAnswerTone(answer)}
            variant={answer.kind === "welcome" ? "welcome" : "status"}
            title={loading ? t("dashboard.answer.reading") : said.title}
            reason={ordered.length > 0 ? undefined : said.reason}
            loading={loading}
            action={checkButton}
            after={also}
            aside={
              welcome || newNas || loading || host === undefined ? undefined : (
                <NasFront
                  host={host}
                  bays={front.bays}
                  board={front.board}
                  size="small"
                  label={fw.welcome.mini(host, result !== undefined)}
                  checked={result !== undefined}
                  landed={landed}
                />
              )
            }
          />
        )}
        {loading ? null : (
          <ScanLine
            label={t("dashboard.scan.label")}
            areas={scanAreas(input, fw.scan)}
          />
        )}
      </div>

      {loading ? null : ordered.length > 0 ? (
        // One region, named by the list itself; the heading is its visible name.
        <Panel>
          <h2 className="mb-4 text-section text-foreground compact:mb-2.5">
            {t("dashboard.needs.label")}
          </h2>
          <AttentionList
            label={t("dashboard.needs.label")}
            items={needs}
            moreLabel={(count) => t("dashboard.needs.more", { count })}
            fewerLabel={t("dashboard.needs.fewer")}
          />
        </Panel>
      ) : stepsOnTop ? (
        <Panel>{firstSteps("across")}</Panel>
      ) : null}

      <DashboardLive
        size="large"
        className={panelClass()}
        devices={r.network.data?.data}
        stale={r.info.isRefetchError}
        updatedAt={r.info.dataUpdatedAt}
      />

      <div
        id={DASHBOARD_TARGETS.map}
        tabIndex={-1}
        className={panelClass({ ground: "plate", className: "outline-none" })}
      >
        <NasMap
          key={replays}
          view={view}
          words={words.map}
          meter={(s) => (
            <StorageMeter
              storage={s}
              facts={facts.get(s.id)}
              loading={reads.storage !== "ok"}
            />
          )}
          onOpen={open}
          captions={captions}
          example={(showTips || replay) && newNas}
          seen={!firstVisit.first}
          onSeen={firstVisit.done}
          replay={replay}
          errors={laneErrors}
          onRetry={(lane) => r.retry[lane]()}
          retrying={retrying}
          onTraced={() => tips.endTip("tip.trace")}
          tip={
            loading ? null : (
              <Tip
                id="tip.trace"
                dismissLabel={t("dashboard.welcome.dismiss")}
                dismissName={t("dashboard.map.traceTipName")}
              >
                {t("dashboard.map.traceTip")}
              </Tip>
            )
          }
          addStorage={
            ghostAdds ? (
              <Button
                variant={accent === "add-storage" ? "primary" : "neutral"}
                size="sm"
                render={<Link to="/storage/filesystems/add" />}
              >
                <Icon name="file-system" mark="create" size={16} />
                {t("dashboard.map.actions.addStorage")}
              </Button>
            ) : null
          }
          actions={mapActions.map(action)}
        />
      </div>

      <DashboardTemperatures
        id={DASHBOARD_TARGETS.temps}
        className={panelClass({ className: "outline-none" })}
        groups={temperatures}
        state={readStateOf(r.diskList)}
        error={r.diskList.error}
        readAt={r.diskList.dataUpdatedAt}
        retrying={r.diskList.isFetching}
        onRetry={r.retry.disks}
      />

      <div className="grid grid-cols-1 items-stretch gap-(--density-gutter) @min-[60rem]/page:grid-cols-2">
        {stepsOnTop ? null : stepsShown ? (
          <Panel>{firstSteps("list")}</Panel>
        ) : (
          <Shortcuts
            title={t("dashboard.shortcuts.title")}
            className={panelClass()}
          >
            {first.eligible && !showTips && !loading
              ? first.steps.filter((s) => !s.done && !s.offers).map(shortcut)
              : null}
            <ShortcutsItem
              icon={<Icon name="person" mark="create" size={20} />}
              render={<Link to="/usermgmt/users/add" />}
            >
              {t("dashboard.shortcuts.addPerson")}
            </ShortcutsItem>
            <ShortcutsItem
              icon={<Icon name="group" mark="create" size={20} />}
              render={<Link to="/usermgmt/groups/add" />}
            >
              {t("dashboard.shortcuts.addGroup")}
            </ShortcutsItem>
            <ShortcutsItem
              icon={<ExternalIcon />}
              render={
                <a
                  href={CLASSIC_HOME}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {t("dashboard.shortcuts.classic")}
              <span className="sr-only"> {t("app.newTab")}</span>
            </ShortcutsItem>
          </Shortcuts>
        )}
        <ThisNas
          className={panelClass({
            // Alone at the foot when the first steps are at the top: the whole row.
            className: stepsOnTop ? "@min-[60rem]/page:col-span-2" : undefined,
          })}
          info={info}
          failed={info === undefined && r.info.isError}
          error={r.info.error}
          retrying={r.info.isFetching}
          onRetry={readAgain}
          layout={stepsOnTop ? "row" : "grid"}
          onShowAround={showMeAround}
        />
      </div>
      <ConfirmDialog
        open={first.hiding.open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            first.hiding.close();
          }
        }}
        title={t("checklist.hideTitle")}
        description={t("checklist.hideBody")}
        confirmLabel={t("checklist.hide")}
        cancelLabel={t("checklist.hideCancel")}
        pending={first.hiding.pending}
        error={
          first.hiding.error
            ? `${t("checklist.hideFailed")}${
                isRpcError(first.hiding.error)
                  ? `\n${first.hiding.error.message}`
                  : ""
              }`
            : undefined
        }
        onConfirm={first.hiding.confirm}
      />
    </div>
  );
}

/** This NAS: every fact from System.getInformation, and "Show me around". */
function ThisNas({
  info,
  failed,
  error,
  retrying,
  onRetry,
  layout,
  onShowAround,
  className,
}: {
  className?: string;
  info: SystemInformation | undefined;
  failed: boolean;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  layout: "grid" | "row";
  onShowAround: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  let facts: ReactNode;
  if (failed) {
    facts = (
      <FactListItem span="full">
        <FactListValue className="font-normal">
          <EmptyState
            variant="error"
            className="items-start py-2 text-start"
            serverMessage={
              isRpcError(error)
                ? { label: t("app.serverMessage"), text: error.message }
                : undefined
            }
            action={
              <Button
                variant="neutral"
                size="sm"
                loading={retrying}
                onClick={onRetry}
              >
                {t("common.tryAgain")}
              </Button>
            }
          >
            {t("dashboard.facts.loadFailed")}
          </EmptyState>
        </FactListValue>
      </FactListItem>
    );
  } else if (info === undefined) {
    facts = (
      <FactListItem span="full">
        <FactListSkeleton rows={4} />
      </FactListItem>
    );
  } else {
    const updates = info.availablePkgUpdates;
    facts = (
      <>
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.name")}</FactListLabel>
          <FactListValue variant="identifier">{info.hostname}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.version")}</FactListLabel>
          <FactListValue>{info.version}</FactListValue>
        </FactListItem>
        {info.uptime === undefined ? null : (
          <FactListItem>
            <FactListLabel>{t("dashboard.facts.uptime")}</FactListLabel>
            <FactListValue>{format.duration(info.uptime)}</FactListValue>
          </FactListItem>
        )}
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.time")}</FactListLabel>
          <FactListValue>{info.time}</FactListValue>
        </FactListItem>
        {updates === undefined ? null : (
          <FactListItem span="full">
            <FactListLabel>{t("dashboard.facts.updates")}</FactListLabel>
            <FactListValue className="font-normal">
              {updates > 0 ? (
                <ExternalLink
                  href={CLASSIC.updates}
                  newTabLabel={t("app.newTab")}
                >
                  {t("dashboard.facts.updatesCount", { count: updates })}
                </ExternalLink>
              ) : (
                t("dashboard.facts.updatesNone")
              )}
            </FactListValue>
          </FactListItem>
        )}
      </>
    );
  }
  return (
    <NasFacts
      className={className}
      title={t("dashboard.facts.title")}
      layout={layout}
      action={
        <Button
          variant="plain"
          size="sm"
          data-show-around=""
          onClick={onShowAround}
        >
          <Play aria-hidden="true" />
          {t("dashboard.facts.showAround")}
        </Button>
      }
    >
      {facts}
    </NasFacts>
  );
}

function UserDashboard({
  username,
  role,
}: {
  username: string | null;
  role: Role;
}) {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const readAgain = useReadAgain();
  const titleId = useId();
  const accountTitleId = useId();
  const accountBodyId = useId();
  const roleWord = t(`role.${role}`);
  const data = info.data;

  let facts: ReactNode;
  if (data === undefined && info.isError) {
    facts = (
      <FactListItem span="full">
        <FactListValue className="font-normal">
          <EmptyState
            variant="error"
            className="items-start py-2 text-start"
            serverMessage={
              isRpcError(info.error)
                ? { label: t("app.serverMessage"), text: info.error.message }
                : undefined
            }
            action={
              <Button
                variant="neutral"
                size="sm"
                loading={info.isFetching}
                onClick={readAgain}
              >
                {t("common.tryAgain")}
              </Button>
            }
          >
            {t("dashboard.loadFailed")}
          </EmptyState>
        </FactListValue>
      </FactListItem>
    );
  } else if (data === undefined) {
    facts = (
      <FactListItem span="full">
        <FactListSkeleton rows={2} />
      </FactListItem>
    );
  } else {
    facts = (
      <>
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.name")}</FactListLabel>
          <FactListValue variant="identifier">{data.hostname}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.time")}</FactListLabel>
          <FactListValue>{data.time}</FactListValue>
        </FactListItem>
      </>
    );
  }

  return (
    <div className="@container/page flex min-w-0 flex-col gap-11 compact:gap-6">
      <section aria-labelledby={titleId} className="flex flex-col gap-1">
        <PageTitle id={titleId} documentTitle={t("dashboard.title")}>
          {username === null
            ? t("dashboard.user.headlineNoName")
            : t("dashboard.user.headline", { username })}
        </PageTitle>
        <p className="text-body text-muted-foreground">
          {username === null
            ? t("dashboard.signedInRole", { role: roleWord })
            : t("dashboard.signedInAs", { username, role: roleWord })}
        </p>
      </section>
      <div className="grid grid-cols-1 items-start gap-x-14 gap-y-9 @min-[60rem]/page:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <Card
          variant="action"
          render={<Link to="/account/settings" />}
          aria-labelledby={accountTitleId}
          aria-describedby={accountBodyId}
        >
          <CardHeader className="items-center">
            <CardTitle id={accountTitleId}>
              {t("dashboard.user.accountTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p id={accountBodyId} className="text-muted-foreground">
              {t("dashboard.user.accountBody")}
            </p>
          </CardContent>
        </Card>
        <NasFacts title={t("dashboard.facts.title")}>{facts}</NasFacts>
      </div>
    </div>
  );
}
