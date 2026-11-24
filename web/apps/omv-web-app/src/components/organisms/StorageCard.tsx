// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Storage card (phase 5 design 1.2; dashboard spec 7): every mounted file system, the
// system drive included, worst first, the first few as capacity rings with the administrator's own
// warning level, the rest as meters behind "Show all". A file system below its level is not claimed
// as OK (with level 0 nothing is monitored): it has no pill, and the header has no OK roll-up. File
// systems that are set up but whose disk is gone come from a second read (FileSystemMgmt.getList,
// once per visit, D3); if that read fails, the card shows what it has. A ring with a page of its own
// is a link tile to it.
import {
  CapacityMeter,
  CapacityRing,
  CapacityRingSkeleton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  rollUp,
  StatusPill,
  type RollUpStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  STORAGE_RINGS,
  type FsState,
  type StorageItem,
} from "../../dashboard/dashboard.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useFileSystemNameText } from "../../hooks/useFileSystemNameText.ts";
import { PHONE_QUERY, useMediaQuery } from "../../hooks/useMediaQuery.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useDensityStore } from "../../stores/useDensityStore.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";
import { FileSystemName } from "../atoms/FileSystemName.tsx";
import { CardStaleLine } from "../molecules/CardStaleLine.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

const ROLL_UP: Record<FsState, RollUpStatus> = {
  critical: "critical",
  warning: "warning",
  unknown: "unknown",
  below: "ok",
};

/** What a ring or a meter shows of one item: its name, figures, threshold, words and link. */
interface ItemView {
  label: ReactNode;
  /** Null: no reading (a dashed ring, no meter). */
  value: number | null;
  valueText: string;
  threshold?: { status: "warning" | "critical"; label: string };
  words: ReactNode;
  /** The item's page, when it has one, and the link's name: "Open file system Data". */
  link?: { target: ItemTarget; label: string };
}

type ItemTarget = { kind: "fs"; fs: string } | { kind: "pool"; pool: string };

/** A router link to an item's page: the ring's whole tile, or the name of a row behind "Show all". */
function targetLink(
  target: ItemTarget,
  props: { className?: string; children?: ReactNode } = {},
) {
  return target.kind === "fs" ? (
    <Link to="/storage/filesystems/$fs" params={{ fs: target.fs }} {...props} />
  ) : (
    <Link
      to="/storage/zfs/pools/$pool"
      params={{ pool: target.pool }}
      {...props}
    />
  );
}

function useItemView() {
  const { t } = useTranslation();
  const format = useFormat();
  const nameText = useFileSystemNameText();

  const figures = (
    fs: Extract<StorageItem, { kind: "mounted" | "zfsPool" }>["fs"],
    state: FsState,
  ) => {
    const size = parseByteCount(fs.size);
    const free = parseByteCount(fs.available);
    if (state === "unknown" || size === null || free === null) {
      return { value: null, valueText: t("filesystem.usage.unread") };
    }
    return {
      value: fs.percentage,
      valueText: t("dashboard.storage.value", {
        percent: format.percent(fs.percentage),
        free: formatBytes(free),
        size: formatBytes(size),
      }),
    };
  };
  const thresholdOf = (state: FsState) =>
    state === "critical" || state === "warning"
      ? { status: state, label: t(`health.${state}`) }
      : undefined;

  return (item: StorageItem): ItemView => {
    if (item.kind === "zfsPool") {
      const linked = item.linked && isPoolAddress(item.pool);
      return {
        label: (
          <span dir="auto">
            {t("dashboard.storage.zfsPool", { pool: item.pool })}
          </span>
        ),
        ...figures(item.fs, item.state),
        threshold: thresholdOf(item.state),
        words: t("dashboard.storage.zfsShare", { count: item.count }),
        link: linked
          ? {
              target: { kind: "pool", pool: item.pool },
              label: t("dashboard.storage.openPool", { pool: item.pool }),
            }
          : undefined,
      };
    }
    const link =
      item.address === null
        ? undefined
        : {
            target: { kind: "fs", fs: item.address } as const,
            label: t("dashboard.storage.openFs", { name: nameText(item.name) }),
          };
    if (item.kind === "missing") {
      // Known to be bad without a reading: the dashed ring with the Critical pill.
      return {
        label: <FileSystemName name={item.name} />,
        value: null,
        valueText: t("dashboard.storage.missingValue"),
        threshold: { status: "critical", label: t("health.critical") },
        words: null,
        link,
      };
    }
    const { fs, state } = item;
    const root = item.name.kind === "systemDrive";
    return {
      label: <FileSystemName name={item.name} />,
      ...figures(fs, state),
      threshold: thresholdOf(state),
      words: (
        <>
          {root ? (
            <p>{t("dashboard.storage.systemDriveHint")}</p>
          ) : fs.comment.trim() !== "" ? (
            <p dir="auto" className="line-clamp-2 break-words">
              {fs.comment}
            </p>
          ) : null}
          <p className="tabular-nums">
            {fs.usagewarnthreshold > 0
              ? t("dashboard.storage.warnsAt", {
                  threshold: `${String(fs.usagewarnthreshold)}%`,
                })
              : t("dashboard.storage.noLevel")}
          </p>
        </>
      ),
      link,
    };
  };
}

function Ring({ view, size }: { view: ItemView; size: "sm" | "md" }) {
  const common = {
    size,
    label: view.label,
    value: view.value,
    max: 100,
    valueText: view.valueText,
    figure: view.value === null ? null : `${String(Math.round(view.value))}%`,
    threshold: view.threshold,
    children: view.words,
  };
  return view.link ? (
    <CapacityRing
      {...common}
      link={targetLink(view.link.target)}
      linkLabel={view.link.label}
    />
  ) : (
    <CapacityRing {...common} />
  );
}

/** One of the rest, behind "Show all": a compact meter with the same words, and its link. */
function Row({ view }: { view: ItemView }) {
  const label = view.link
    ? targetLink(view.link.target, {
        className: routerLinkClass,
        children: view.label,
      })
    : view.label;
  return (
    <li className="flex flex-col gap-1">
      <CapacityMeter
        variant="compact"
        label={label}
        value={view.value}
        max={100}
        threshold={view.value === null ? undefined : view.threshold}
        valueText={view.valueText}
      />
      {view.value === null && view.threshold ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={view.threshold.status}>
            {view.threshold.label}
          </StatusPill>
        </p>
      ) : null}
      {view.words ? (
        <div className="text-caption text-tertiary-foreground">
          {view.words}
        </div>
      ) : null}
    </li>
  );
}

export function StorageCard({
  items,
  loading,
  error,
  stale,
  updatedAt,
  retrying,
  onRetry,
  className,
  index,
}: {
  /** The card's items, worst first; undefined until the first read. */
  items: readonly StorageItem[] | undefined;
  loading: boolean;
  /** Set when the first read failed and there is nothing to show. */
  error: unknown;
  stale: boolean;
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
  /** Its place in the page grid, and in the rise-in order. */
  className?: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const viewOf = useItemView();
  const [showAll, setShowAll] = useState(false);
  const density = useDensityStore((s) => s.density);
  const phone = useMediaQuery(PHONE_QUERY);
  const size = density === "compact" || phone ? "sm" : "md";
  const visible = STORAGE_RINGS[density];
  const ringGrid =
    "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-gutter gap-y-4";

  let meta: ReactNode = null;
  let content: ReactNode;
  if (items === undefined && loading) {
    content = (
      <ul aria-hidden="true" className={ringGrid}>
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <CapacityRingSkeleton size={size} />
          </li>
        ))}
      </ul>
    );
  } else if (items === undefined) {
    content = (
      <ReadFailed
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        className="py-4"
      >
        {t("dashboard.storage.loadFailed")}
      </ReadFailed>
    );
  } else if (items.length === 0) {
    content = (
      <EmptyState
        className="py-4"
        action={
          <Link to="/storage/filesystems/add" className={routerLinkClass}>
            {t("dashboard.storage.emptyLink")}
          </Link>
        }
      >
        {t("dashboard.storage.empty")}
      </EmptyState>
    );
  } else {
    const summary = rollUp(
      items.map((i) => (i.kind === "missing" ? "critical" : ROLL_UP[i.state])),
    );
    const worst = summary.status;
    meta =
      worst === "critical" || worst === "warning" ? (
        <>
          <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
          <span className="text-foreground">
            {t("dashboard.storage.rollUp", {
              count: summary.count,
              total: summary.total,
              status: t(`health.${worst}`),
            })}
          </span>
        </>
      ) : (
        <span>{t("dashboard.storage.count", { count: items.length })}</span>
      );
    const first = items.slice(0, visible);
    const rest = items.slice(visible);
    content = (
      <>
        <CardStaleLine
          stale={stale}
          updatedAt={updatedAt}
          retrying={retrying}
          onRetry={onRetry}
        />
        <ul className={ringGrid}>
          {first.map((item) => (
            <li key={item.key} className="min-w-0">
              <Ring view={viewOf(item)} size={size} />
            </li>
          ))}
        </ul>
        {rest.length > 0 ? (
          <Disclosure open={showAll} onOpenChange={setShowAll}>
            <DisclosurePanel keepMounted={false}>
              <ul className="flex flex-col gap-4">
                {rest.map((item) => (
                  <Row key={item.key} view={viewOf(item)} />
                ))}
              </ul>
            </DisclosurePanel>
            <DisclosureTrigger variant="inline">
              {showAll
                ? t("dashboard.storage.showFewer")
                : t("dashboard.storage.showAll", { count: items.length })}
            </DisclosureTrigger>
          </Disclosure>
        ) : null}
      </>
    );
  }

  return (
    <DashboardCard
      title={t("dashboard.storage.title")}
      meta={meta}
      busy={items === undefined && loading}
      busyLabel={t("dashboard.storage.loading")}
      className={className}
      index={index}
      footer={
        <Link to="/storage/filesystems" className={routerLinkClass}>
          {t("dashboard.storage.link")}
        </Link>
      }
    >
      {content}
    </DashboardCard>
  );
}
