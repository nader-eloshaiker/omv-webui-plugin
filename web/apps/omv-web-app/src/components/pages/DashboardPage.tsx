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
  NasMap,
  nasMapActions,
  nasMapView,
  orderAttention,
  SegmentBar,
  Shortcuts,
  ShortcutsItem,
  Tip,
  useTips,
  WelcomeLine,
  type NasLane,
  type NasMapAction,
  type NasMapItem,
  type NasReads,
  type NasStorage,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink as ExternalIcon, Play } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  attentionRows,
  missingFileSystems,
  storageItems,
} from "../../dashboard/dashboard.ts";
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

  // Anything done on the page ends the welcome (P.2), "Got it" included; "Show me around" brings it
  // back, so pressing it does not count.
  const onPageAction = (event: PointerEvent | KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      !tips.isSeen("tip.new-interface") &&
      target.closest("[data-welcome], [data-show-around]") === null
    ) {
      tips.endTip("tip.new-interface");
    }
  };

  const showMeAround = () => {
    askShowAround();
    rootRef.current?.scrollIntoView?.({ block: "start" });
  };

  const firstSteps = (
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

  return (
    <div
      ref={rootRef}
      className="@container/page flex min-w-0 flex-col gap-11 compact:gap-6"
      onPointerDown={onPageAction}
      onKeyDown={onPageAction}
    >
      <div className="flex flex-col gap-6 compact:gap-3">
        {!newNas && newcomer && !loading ? (
          <div data-welcome="">
            <WelcomeLine
              id="tip.new-interface"
              dismissLabel={t("dashboard.welcome.dismiss")}
              dismissName={t("dashboard.welcome.dismissName")}
              detail={t("dashboard.welcome.detail")}
              more={{
                label: t("dashboard.welcome.more"),
                items: [
                  t("dashboard.welcome.item1"),
                  t("dashboard.welcome.item2"),
                  t("dashboard.welcome.item3"),
                  t("dashboard.welcome.item4"),
                ],
              }}
              actions={
                <ExternalLink href={CLASSIC_HOME} newTabLabel={t("app.newTab")}>
                  {t("dashboard.welcome.classic")}
                </ExternalLink>
              }
            >
              {t("dashboard.welcome.line")}
            </WelcomeLine>
          </div>
        ) : null}
        <NasAnswer
          titleRef={titleRef}
          status={nasAnswerTone(answer)}
          variant={answer.kind === "welcome" ? "welcome" : "status"}
          title={loading ? t("dashboard.answer.reading") : said.title}
          reason={ordered.length > 0 ? undefined : said.reason}
          loading={loading}
        />
        {loading ? null : (
          <AttentionList
            label={t("dashboard.needs.label")}
            items={needs}
            moreLabel={(count) => t("dashboard.needs.more", { count })}
            fewerLabel={t("dashboard.needs.fewer")}
          />
        )}
      </div>
      {stepsOnTop ? firstSteps : null}
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
        actions={footer.map(action)}
      />
      <DashboardLive
        devices={r.network.data?.data}
        stale={r.info.isRefetchError}
        updatedAt={r.info.dataUpdatedAt}
      />
      <DashboardTemperatures
        groups={temperatures}
        state={readStateOf(r.diskList)}
        error={r.diskList.error}
        readAt={r.diskList.dataUpdatedAt}
        retrying={r.diskList.isFetching}
        onRetry={r.retry.disks}
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
          <Shortcuts title={t("dashboard.shortcuts.title")}>
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
}: {
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
