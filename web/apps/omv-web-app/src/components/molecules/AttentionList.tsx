// SPDX-License-Identifier: GPL-3.0-or-later
// What needs the reader (phase 5 design 1.7; dashboard spec 5): one action card per attention row,
// worst first, then in a fixed order of kinds, so cards never change places between polls. Each card
// is one link: its pill (or the clock icon for advice), a short title, today's sentence and one next
// step, to a route of this interface or a fixed page of the classic interface in a new tab (UI-3).
// The link is named by its next step, so a screen reader hears where it goes, then what and why
// (the pill word, the title and the sentence are its description). Server names are text (UI-2).
//
// A needed restart is a Warning, not pending gold: the band's Apply cannot fix it. One card stands
// for every service that is on but not running, because the fix is the same. Disk cards say when
// they were read, since disk readings do not update by themselves. At most six show; the rest are
// behind "Show N more", and the sort puts the worst first, so a hidden card is never worse than a
// shown one. A card added by a later poll settles in alone and is announced once; a resolved one
// fades and gives up its height, so the cards after it close up.
import {
  Card,
  CardChevron,
  CardExternalMark,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  LeavingItem,
  StatusPill,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock } from "lucide-react";
import {
  useId,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ATTENTION_VISIBLE,
  isCoreService,
  type AttentionRow,
} from "../../dashboard/dashboard.ts";
import { isDiskName } from "../../disks/diskWords.ts";
import { isolate } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useFileSystemNameText } from "../../hooks/useFileSystemNameText.ts";
import { CLASSIC, CLASSIC_HOME } from "../../navigation/navigation.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { AttentionTitle } from "./AttentionTitle.tsx";

const SERVICE_SETTINGS = {
  samba: CLASSIC.smbSettings,
  nfs: CLASSIC.nfsSettings,
  rsyncd: CLASSIC.rsyncServerSettings,
} as const;

/** Where a card goes: a route of this interface, or a fixed classic page in a new tab. */
type Next =
  | { kind: "route"; link: ReactElement; words: ReactNode }
  | { kind: "classic"; href: string; words: ReactNode };

interface CardParts {
  tone: "critical" | "warning" | "none";
  body: ReactNode;
  next: Next;
  /** A disk card's "Read at 10:41." */
  readAt?: number;
}

const ZFS_BODY = {
  degraded: "dashboard.attention.zfsDegraded",
  unusable: "dashboard.attention.zfsUnusable",
  damaged: "dashboard.attention.zfsDamaged",
} as const;

/** The parts of one card, by its kind (spec 5.2). */
function useCardParts() {
  const { t } = useTranslation();
  const format = useFormat();
  const nameText = useFileSystemNameText();

  // The file system's page when it has one, else the File systems list (file-systems design 9).
  const fsNext = (row: {
    name: Parameters<typeof nameText>[0];
    address: string | null;
  }): Next =>
    row.address === null
      ? {
          kind: "route",
          link: <Link to="/storage/filesystems" />,
          words: t("dashboard.storage.link"),
        }
      : {
          kind: "route",
          link: (
            <Link to="/storage/filesystems/$fs" params={{ fs: row.address }} />
          ),
          words: t("dashboard.storage.openFs", { name: nameText(row.name) }),
        };

  return (row: AttentionRow): CardParts => {
    switch (row.kind) {
      case "fsFull":
        return {
          tone: "critical",
          body: t("dashboard.attention.fsFull"),
          next: fsNext(row),
        };
      case "fsMissing":
        return {
          tone: "critical",
          body: t("dashboard.attention.fsMissing"),
          next: fsNext(row),
        };
      case "fsWarning":
        return {
          tone: "warning",
          body: t("dashboard.attention.fsWarning", {
            percent: format.percent(row.percent),
            threshold: `${String(row.threshold)}%`,
          }),
          next: fsNext(row),
        };
      case "zfsPool":
        return {
          tone: "critical",
          body: t(ZFS_BODY[row.health]),
          next: isPoolAddress(row.pool)
            ? {
                kind: "route",
                link: (
                  <Link
                    to="/storage/zfs/pools/$pool"
                    params={{ pool: row.pool }}
                  />
                ),
                words: t("dashboard.attention.zfsLink", { pool: row.pool }),
              }
            : {
                kind: "classic",
                href: CLASSIC.zfs,
                words: t("zfs.classicLink"),
              },
        };
      case "diskCritical":
      case "diskWarning": {
        const model = row.model.trim();
        const reason = t(`diskHealth.reason.${row.reason}`);
        return {
          tone: row.kind === "diskCritical" ? "critical" : "warning",
          body: (
            <>
              {model === ""
                ? reason
                : t("dashboard.attention.diskBody", {
                    reason,
                    model: isolate(model),
                  })}
              {row.monitored ? null : (
                <> {t("dashboard.attention.diskUnmonitored")}</>
              )}
            </>
          ),
          next: isDiskName(row.devicename)
            ? {
                kind: "route",
                link: (
                  <Link
                    to="/storage/disks/$disk"
                    params={{ disk: row.devicename }}
                  />
                ),
                words: (
                  <Trans
                    i18nKey="dashboard.attention.diskLink"
                    components={{
                      device: <IdentifierText value={row.device} />,
                    }}
                  />
                ),
              }
            : {
                kind: "route",
                link: <Link to="/storage/smart/overview" />,
                words: t("dashboard.disks.link"),
              },
          readAt: row.readAt,
        };
      }
      case "servicesDown": {
        const [only] = row.services;
        const one = row.services.length === 1 && only !== undefined;
        let next: Next;
        if (one && only.name === "ssh") {
          next = {
            kind: "route",
            link: <Link to="/services/ssh" />,
            words: t("dashboard.attention.serviceLink.ssh"),
          };
        } else if (one && only.name === "nfs") {
          // Linux and Unix sharing has its page here now (services design 12.2).
          next = {
            kind: "route",
            link: <Link to="/services/nfs" />,
            words: t("dashboard.attention.serviceLink.nfs"),
          };
        } else if (one && only.name === "rsyncd") {
          // The rsync server has its tab here now (services design 12.2).
          next = {
            kind: "route",
            link: <Link to="/services/rsync/server" />,
            words: t("dashboard.attention.serviceLink.rsyncd"),
          };
        } else if (one && isCoreService(only.name) && only.name !== "ssh") {
          next = {
            kind: "classic",
            href: SERVICE_SETTINGS[only.name],
            words: t(`dashboard.attention.serviceLink.${only.name}`),
          };
        } else {
          next = {
            kind: "route",
            link: <Link to="/diagnostics/system-logs" />,
            words: t("dashboard.attention.serviceLogs"),
          };
        }
        const list = new Intl.ListFormat(undefined, {
          type: "conjunction",
        }).format(row.services.map((s) => s.title));
        return {
          tone: "critical",
          body: one
            ? t("dashboard.attention.serviceDown", { count: 1 })
            : t("dashboard.attention.serviceDown", {
                count: row.services.length,
                list,
              }),
          next,
        };
      }
      case "restart":
        return {
          tone: "warning",
          body: t("dashboard.attention.restart"),
          next: {
            kind: "classic",
            href: CLASSIC_HOME,
            words: t("dashboard.attention.restartLink"),
          },
        };
      case "clock":
        return {
          tone: "none",
          body: t("dashboard.attention.clock"),
          next: {
            kind: "classic",
            href: CLASSIC.dateTime,
            words: t("dashboard.attention.clockLink"),
          },
        };
    }
  };
}

function AttentionCard({
  row,
  parts,
  staggerIndex,
}: {
  row: AttentionRow;
  parts: CardParts;
  /** Its place in the first arrival; a card added later settles in alone (0). */
  staggerIndex: number;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const pillId = useId();
  const titleId = useId();
  const bodyId = useId();
  const nextId = useId();
  const { tone, body, next, readAt } = parts;
  const external = next.kind === "classic";
  const mark =
    tone === "none" ? (
      <Clock
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    ) : (
      <StatusPill id={pillId} status={tone} className="shrink-0">
        {t(`dashboard.attention.${tone}`)}
      </StatusPill>
    );
  const shared = {
    variant: "action" as const,
    tone,
    "aria-labelledby": nextId,
    // The pill word, the title and the sentence: what and why, after where.
    "aria-describedby":
      tone === "none"
        ? `${titleId} ${bodyId}`
        : `${pillId} ${titleId} ${bodyId}`,
    className:
      "h-full gap-3 p-card motion-safe:animate-settle-in stagger compact:gap-2",
    style: { "--stagger-index": staggerIndex } as CSSProperties,
  };
  const content = (
    <>
      <div className="flex items-center gap-2">
        {mark}
        {external ? <CardExternalMark /> : <CardChevron />}
      </div>
      <h3
        id={titleId}
        className="text-section text-foreground [overflow-wrap:anywhere]"
      >
        <AttentionTitle row={row} />
      </h3>
      <p id={bodyId} className="text-muted-foreground">
        {body}
      </p>
      <p className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 font-medium text-action-label">
          <span id={nextId}>{next.words}</span>
          {external ? null : (
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-[translate] duration-fast ease-standard group-hover/card:translate-x-0.5 rtl:-scale-x-100"
            />
          )}
        </span>
        {readAt === undefined ? null : (
          <span className="text-caption text-tertiary-foreground tabular-nums">
            {t("dashboard.attention.diskReadAt", {
              time: format.clock(readAt),
            })}
          </span>
        )}
      </p>
    </>
  );
  return external ? (
    <Card
      {...shared}
      render={<a href={next.href} />}
      opens="new-tab"
      newTabLabel={t("app.newTab")}
    >
      {content}
    </Card>
  ) : (
    <Card {...shared} render={next.link}>
      {content}
    </Card>
  );
}

export function AttentionList({ rows }: { rows: readonly AttentionRow[] }) {
  const { t } = useTranslation();
  const labelId = useId();
  const partsOf = useCardParts();
  const { entries, left } = useLeavingItems(rows, (row) => row.key);
  const [showAll, setShowAll] = useState(false);
  // The cards of the first arrival enter in turn; a card a later poll adds is announced once.
  const [firstKeys] = useState(() => rows.map((row) => row.key));
  const [seen, setSeen] = useState<ReadonlySet<string>>(
    () => new Set(firstKeys),
  );
  const [added, setAdded] = useState(0);
  const fresh = rows.filter((row) => !seen.has(row.key));
  if (fresh.length > 0) {
    // Adjusting state while rendering (react.dev, "storing information from previous renders").
    setSeen(new Set([...seen, ...fresh.map((row) => row.key)]));
    setAdded(fresh.length);
  }

  if (entries.length === 0) {
    return null;
  }
  const item = (entry: (typeof entries)[number]) => {
    const first = firstKeys.indexOf(entry.key);
    return (
      <LeavingItem
        key={entry.key}
        leaving={entry.leaving}
        onLeft={() => {
          left(entry.key);
        }}
        className="min-w-0"
      >
        <AttentionCard
          row={entry.item}
          parts={partsOf(entry.item)}
          staggerIndex={first < 0 ? 0 : first}
        />
      </LeavingItem>
    );
  };
  const grid =
    "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-gutter compact:grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))]";
  const shown = entries.slice(0, ATTENTION_VISIBLE);
  const rest = entries.slice(ATTENTION_VISIBLE);

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-3">
      <h2 id={labelId} className="text-section text-foreground">
        {t("dashboard.attention.label")}
      </h2>
      <ul className={grid}>{shown.map(item)}</ul>
      {rest.length > 0 ? (
        <Disclosure open={showAll} onOpenChange={setShowAll}>
          <DisclosurePanel keepMounted={false}>
            <ul className={grid}>{rest.map(item)}</ul>
          </DisclosurePanel>
          <DisclosureTrigger variant="inline">
            {showAll
              ? t("dashboard.attention.fewer")
              : t("dashboard.attention.more", { count: rest.length })}
          </DisclosureTrigger>
        </Disclosure>
      ) : null}
      <p role="status" className="sr-only">
        {added > 0 ? t("dashboard.attention.added", { count: added }) : ""}
      </p>
    </section>
  );
}
