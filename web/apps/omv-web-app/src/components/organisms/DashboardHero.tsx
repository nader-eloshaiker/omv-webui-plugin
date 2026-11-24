// SPDX-License-Identifier: GPL-3.0-or-later
// The answer the dashboard opens with (dashboard spec 4): the page title as a small eyebrow, a kicker
// with the overall state, the NAS's name and how fresh the figures are, the answer in one plain line,
// one sentence under it, at most one next step, and the health ring of the four areas beside it. On
// the page ground under the ambient light, never a card.
//
// The headline is not a heading and not a live region: it changes with the reads, so the page title
// stays the landmark, and it does not chatter on every poll. Its ink is the foreground in every state;
// the pill and the ring carry the colour. When the one next step goes while it has focus (the check
// ends with every disk OK), focus moves to the headline instead of being lost.
import {
  Button,
  HealthRing,
  HealthRingSkeleton,
  Identifier,
  PageAnswer,
  PageAnswerAction,
  PageAnswerAside,
  PageAnswerBody,
  PageAnswerDescription,
  PageAnswerHeadline,
  PageAnswerHeadlineSkeleton,
  PageAnswerKicker,
  Skeleton,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  isHealthWord,
  knownAreas,
  overallStatus,
  type AreaId,
  type AreaState,
  type AreaWord,
  type DashboardAnswer,
  type UnknownLine,
} from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { PHONE_QUERY, useMediaQuery } from "../../hooks/useMediaQuery.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useDensityStore } from "../../stores/useDensityStore.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AttentionTitle } from "../molecules/AttentionTitle.tsx";

/** An area's word: the fixed status word, or the area's own precise one. */
function useAreaWord() {
  const { t } = useTranslation();
  return (word: AreaWord): string =>
    isHealthWord(word) ? t(`health.${word}`) : t(`dashboard.area.${word}`);
}

/** Area names joined as the locale joins a list: "Services and System". */
function useAreaList() {
  const { t } = useTranslation();
  return (ids: readonly AreaId[]) =>
    new Intl.ListFormat(undefined, { type: "conjunction" }).format(
      ids.map((id) => t(`dashboard.area.${id}`)),
    );
}

/** Why an area is not known, in the words its legend row and its card use. */
function useUnknownSentence() {
  const { t } = useTranslation();
  const list = useAreaList();
  return (line: UnknownLine): string => {
    switch (line.kind) {
      case "readFailed":
        return t("dashboard.hero.readFailedList", { list: list(line.areas) });
      case "noStorage":
        return t("dashboard.hero.noStorage");
      case "disksChecking":
        return t("diskCheck.checkingLine");
      case "disksNotChecked":
        return t("dashboard.hero.disksNotChecked");
      case "reading":
        return t("dashboard.hero.readingList", { list: list(line.areas) });
      case "unknown":
        return t("dashboard.hero.unknownList", { list: list(line.areas) });
    }
  };
}

/**
 * When the one next step goes while it had focus, focus moves to the headline (spec 4.4), the
 * pattern of the page title when the first steps go.
 */
function useFocusHeadlineWhenGone(
  action: string | null,
  headlineRef: RefObject<HTMLParagraphElement | null>,
) {
  const previousRef = useRef(action);
  useEffect(() => {
    const was = previousRef.current;
    previousRef.current = action;
    if (was === null || was === action) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        headlineRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [action, headlineRef]);
}

export function DashboardHero({
  answer,
  areas,
  hostname,
  updatedAt,
  stale,
  retrying,
  onRetry,
  onReadAgain,
  readingAgain,
}: {
  answer: DashboardAnswer;
  areas: readonly AreaState[];
  /** From System.getInformation, once read. */
  hostname: string | undefined;
  /** When the last good System.getInformation reply arrived; 0 before the first. */
  updatedAt: number;
  /** The last background read of the figures failed: they stay, and the kicker says since when. */
  stale: boolean;
  retrying: boolean;
  /** A foreground read of the figures, for the kicker's "Try again". */
  onRetry: () => void;
  /** Foreground reads of what could not be read, for the answer's "Try again". */
  onReadAgain: () => void;
  readingAgain: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const areaWord = useAreaWord();
  const areaList = useAreaList();
  const unknownSentence = useUnknownSentence();
  const check = useDiskCheck();
  const headlineRef = useRef<HTMLParagraphElement>(null);
  const titleId = useId();
  const compact = useDensityStore((s) => s.density) === "compact";
  const phone = useMediaQuery(PHONE_QUERY);
  const ringSize = compact || phone ? "md" : "lg";
  const loading = answer.kind === "loading";
  const overall = overallStatus(areas);
  const time = format.clock(updatedAt);

  let headline: ReactNode = null;
  // Each sub-line keyed by what it says, so a line that changes is a new element.
  const lines: { key: string; node: ReactNode }[] = [];
  let action: { key: string; node: ReactNode } | null = null;
  switch (answer.kind) {
    case "loading":
      break;
    case "problems": {
      const { count, first } = answer;
      if (count === 1 && first !== undefined) {
        headline = <AttentionTitle row={first} />;
      } else if (count > 1 && first !== undefined) {
        headline = t("dashboard.headline.many", { count });
        lines.push({
          key: "worst",
          node: (
            <Trans
              i18nKey="dashboard.hero.worst"
              components={{
                title: <NodeSlot value={<AttentionTitle row={first} />} />,
              }}
            />
          ),
        });
      } else {
        headline = t("dashboard.headline.look", {
          list: areaList(
            areas
              .filter((a) => a.status === "warning" || a.status === "critical")
              .map((a) => a.id),
          ),
        });
      }
      if (answer.unknown !== null) {
        lines.push({
          key: answer.unknown.kind,
          node: unknownSentence(answer.unknown),
        });
      }
      break;
    }
    case "unknown": {
      const { line } = answer;
      headline =
        line.kind === "readFailed"
          ? t("dashboard.headline.readFailed")
          : t("dashboard.headline.noProblems");
      lines.push({ key: line.kind, node: unknownSentence(line) });
      if (line.kind === "readFailed") {
        action = {
          key: "readAgain",
          node: (
            <Button
              variant="neutral"
              loading={readingAgain}
              onClick={onReadAgain}
            >
              {t("common.tryAgain")}
            </Button>
          ),
        };
      } else if (line.kind === "noStorage") {
        action = {
          key: "addStorage",
          node: (
            <Link to="/storage/filesystems/add" className={routerLinkClass}>
              {t("dashboard.storage.emptyLink")}
            </Link>
          ),
        };
      } else if (
        line.kind === "disksNotChecked" ||
        line.kind === "disksChecking"
      ) {
        // One element for both states, so focus stays on it while it says "Checking…".
        action = {
          key: "diskCheck",
          node: (
            <Button
              variant="neutral"
              loading={check.checking}
              onClick={check.checking ? undefined : check.start}
            >
              {check.checking ? t("diskCheck.checking") : t("diskCheck.check")}
            </Button>
          ),
        };
      }
      break;
    }
    case "ok":
      headline = t("dashboard.headline.ok");
      lines.push({
        key: "allChecked",
        node: t("dashboard.hero.allChecked", {
          time: format.clock(answer.checkedAt),
        }),
      });
      break;
  }
  useFocusHeadlineWhenGone(action?.key ?? null, headlineRef);

  const counted = knownAreas(areas);
  let figure: ReactNode;
  if (overall === "critical" || overall === "warning") {
    const count =
      answer.kind === "problems" && answer.count > 0
        ? answer.count
        : areas.filter((a) => a.status === overall).length;
    figure = (
      <>
        <span>{count}</span>
        <span className="text-xs font-medium text-muted-foreground">
          {t("dashboard.hero.toFix")}
        </span>
      </>
    );
  } else if (overall === "unknown") {
    figure = (
      <>
        <span>{`${String(counted.known)}/${String(counted.total)}`}</span>
        <span className="text-xs font-medium text-muted-foreground">
          {t("dashboard.hero.checked")}
        </span>
      </>
    );
  } else {
    figure = t("dashboard.hero.ok");
  }

  return (
    <PageAnswer
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      className="col-span-full"
    >
      <PageAnswerBody>
        <PageTitle id={titleId} variant="eyebrow">
          {t("dashboard.title")}
        </PageTitle>
        {loading ? (
          <>
            <p role="status" className="sr-only">
              {t("dashboard.loading")}
            </p>
            <Skeleton className="w-48 text-caption" />
            <PageAnswerHeadlineSkeleton />
            <Skeleton className="w-4/5 max-w-[60ch]" />
          </>
        ) : (
          <>
            <PageAnswerKicker>
              <StatusPill status={overall}>{t(`health.${overall}`)}</StatusPill>
              {hostname === undefined ? null : (
                <Identifier className="text-muted-foreground">
                  {hostname}
                </Identifier>
              )}
              {updatedAt > 0 && !stale ? (
                <span>{t("dashboard.hero.updated", { time })}</span>
              ) : null}
              <span role="status" className="empty:hidden">
                {updatedAt > 0 && stale ? t("dashboard.stale", { time }) : ""}
              </span>
              {updatedAt > 0 && stale ? (
                <Button
                  variant="neutral"
                  size="sm"
                  loading={retrying}
                  onClick={onRetry}
                >
                  {t("common.tryAgain")}
                </Button>
              ) : null}
            </PageAnswerKicker>
            <PageAnswerHeadline ref={headlineRef}>
              {headline}
            </PageAnswerHeadline>
            {lines.map((line) => (
              <PageAnswerDescription key={line.key}>
                {line.node}
              </PageAnswerDescription>
            ))}
            {action === null ? null : (
              <PageAnswerAction>{action.node}</PageAnswerAction>
            )}
          </>
        )}
      </PageAnswerBody>
      <PageAnswerAside>
        {loading ? (
          <HealthRingSkeleton size={ringSize} areas={areas.length} />
        ) : (
          <HealthRing
            size={ringSize}
            legend="beside"
            label={t("dashboard.hero.ringLabel")}
            figure={figure}
            areas={areas.map((a) => ({
              id: a.id,
              label: t(`dashboard.area.${a.id}`),
              status: a.status,
              statusLabel: areaWord(a.word),
            }))}
          />
        )}
      </PageAnswerAside>
    </PageAnswer>
  );
}
