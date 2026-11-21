// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's health details (phase 5 disks design 2.4). Read only when the reader presses "Read health
// details": the three reads run smartctl on this disk and wake it if it sleeps, and only this disk.
// They are the generated query hooks with ON_REQUEST options: never enabled, so nothing starts them by
// itself (not opening the page, window focus, reconnecting, or a finished task invalidating every
// query); the press calls `refetch()`. The result stays in the query cache for the session and a
// reload forgets it (UI-13). The full report is read the first time its disclosure is opened. Every
// call uses the row's `devicefile` from DiskMgmt.getList, never the address (UI-4). Everything the
// disk reports is rendered as text (UI-2).
import type {
  DiskDevice,
  SmartAttribute,
  SmartInformation,
  SmartSelfTestLogEntry,
} from "@omv-webui/react-api-omv/generated";
import {
  useSmartGetAttributes,
  useSmartGetExtendedInformation,
  useSmartGetInformation,
  useSmartGetSelfTestLogs,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  Identifier,
  rollUp,
  ServerMessage,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SLOT, splitSlots } from "../../disks/disksList.ts";
import {
  assessmentState,
  hoursOf,
  isAsleep,
  testKindWord,
  testResultWord,
} from "../../disks/diskWords.ts";
import {
  aboutFacts,
  hoursAgo,
  hoursDuration,
  keyReadings,
  reportLines,
  type AboutFact,
  type KeyReading,
} from "../../disks/healthDetails.ts";
import { useFormat } from "../../format/useFormat.ts";
import { ON_REQUEST } from "../../hooks/useDiskReads.ts";

type PartName = "information" | "readings" | "tests";

/** "3 years, 41 days" from hours. */
function useHours() {
  const { t } = useTranslation();
  return (hours: number): string => {
    const [first, second] = hoursDuration(hours).map(({ unit, count }) =>
      t(`format.duration.${unit}`, { count }),
    );
    return second === undefined
      ? (first ?? "")
      : t("format.duration.pair", { first, second });
  };
}

function PartFailed({
  part,
  error,
  retrying,
  onRetry,
}: {
  part: PartName;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-2">
      <p>
        {t("disk.details.partFailed", {
          part: t(`disk.details.part.${part}`),
        })}
      </p>
      {isRpcError(error) ? (
        <ServerMessage label={t("app.serverMessage")}>
          {error.message}
        </ServerMessage>
      ) : null}
      <Button
        variant="neutral"
        size="sm"
        loading={retrying}
        onClick={retrying ? undefined : onRetry}
      >
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}

function AboutValue({ fact }: { fact: AboutFact }) {
  const { t } = useTranslation();
  const format = useFormat();
  const hours = useHours();
  switch (fact.key) {
    case "firmware":
      return <FactListValue variant="identifier">{fact.text}</FactListValue>;
    case "kind":
      return (
        <FactListValue>
          {fact.kind.kind === "ssd"
            ? t("disk.details.kindSsd")
            : fact.kind.kind === "hdd"
              ? t("disk.details.kindHdd", { rpm: format.count(fact.kind.rpm) })
              : fact.kind.text}
        </FactListValue>
      );
    case "powerOnTime":
      return <FactListValue>{hours(fact.hours)}</FactListValue>;
    case "powerCycles":
      return <FactListValue>{format.count(fact.count)}</FactListValue>;
    default:
      return <FactListValue>{fact.text}</FactListValue>;
  }
}

function About({ info }: { info: SmartInformation }) {
  const { t } = useTranslation();
  const facts = aboutFacts(info);
  const label: Record<AboutFact["key"], string> = {
    modelFamily: t("disk.details.modelFamily"),
    model: t("disk.details.model"),
    firmware: t("disk.details.firmware"),
    kind: t("disk.details.kind"),
    capacity: t("disk.details.capacity"),
    powerOnTime: t("disk.details.powerOnTime"),
    powerCycles: t("disk.details.powerCycles"),
  };
  return (
    <FactList>
      {facts.map((fact) => (
        <FactListItem key={fact.key}>
          <FactListLabel>{label[fact.key]}</FactListLabel>
          <AboutValue fact={fact} />
        </FactListItem>
      ))}
    </FactList>
  );
}

/** The pill and the short reason of an attribute's assessment. */
function Assessment({
  assessment,
  showOk,
}: {
  assessment: string;
  showOk: boolean;
}) {
  const { t } = useTranslation();
  const state = assessmentState(assessment);
  if (state.status === "ok" && !showOk) {
    return null;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusPill status={state.status}>
        {t(`health.${state.status}`)}
      </StatusPill>
      {state.reason === null ? null : (
        <span className="text-sm">
          {t(`disk.details.assess.${state.reason}`)}
        </span>
      )}
    </span>
  );
}

function KeyReadingValue({ reading }: { reading: KeyReading }) {
  const format = useFormat();
  const hours = useHours();
  if (reading.value.kind === "text") {
    return <Identifier>{reading.value.text}</Identifier>;
  }
  const n = reading.value.value;
  if (reading.id === 9) {
    return <>{hours(n)}</>;
  }
  if (reading.id === "temperature") {
    return <>{format.celsius(n)}</>;
  }
  return <>{format.count(n)}</>;
}

const MEANING = new Set<KeyReading["id"]>([5, 197, 198, 187, 199]);

function KeyReadingName({ id }: { id: KeyReading["id"] }) {
  const { t } = useTranslation();
  switch (id) {
    case 9:
      return <>{t("disk.details.attr.9")}</>;
    case 12:
      return <>{t("disk.details.attr.12")}</>;
    case "temperature":
      return <>{t("disk.details.attr.temperature")}</>;
    default:
      return <>{t(`disk.details.attr.${id}.name`)}</>;
  }
}

function Readings({
  attributes,
  device,
}: {
  attributes: readonly SmartAttribute[];
  device: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (attributes.length === 0) {
    return <p className="max-w-prose">{t("disk.details.noTable")}</p>;
  }
  const statuses = attributes.map((a) => assessmentState(a.assessment).status);
  const summary = rollUp(statuses);
  const worst = statuses.find((s) => s === summary.status) ?? "unknown";
  const readings = keyReadings(attributes);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
        <span>
          {worst === "ok"
            ? t("disk.details.allWithin", { count: summary.total })
            : t("disk.details.rollUp", {
                count: summary.count,
                total: summary.total,
                status: t(`health.${worst}`),
              })}
        </span>
      </p>
      {readings.length > 0 ? (
        <FactList>
          {readings.map((reading) => (
            <FactListItem key={String(reading.id)}>
              <FactListLabel>
                <KeyReadingName id={reading.id} />
              </FactListLabel>
              <FactListValue>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular-nums">
                    <KeyReadingValue reading={reading} />
                  </span>
                  <Assessment
                    assessment={reading.attribute.assessment}
                    showOk={false}
                  />
                </span>
                {MEANING.has(reading.id) ? (
                  <span className="block text-sm text-muted-foreground">
                    {t(`disk.details.attr.${reading.id as 5}.meaning`)}
                  </span>
                ) : null}
              </FactListValue>
            </FactListItem>
          ))}
        </FactList>
      ) : null}
      <Disclosure open={open} onOpenChange={setOpen}>
        <DisclosureTrigger variant="inline">
          {open
            ? t("disk.details.hideAll")
            : t("disk.details.showAll", { count: attributes.length })}
        </DisclosureTrigger>
        <DisclosurePanel keepMounted={false}>
          <p className="max-w-prose text-sm">{t("disk.details.tableIntro")}</p>
          <Table
            aria-label={t("disk.details.tableLabel", { device })}
            frameLabel={t("disk.details.tableLabel", { device })}
          >
            <TableHeader>
              <TableRow>
                <TableHead numeric>{t("disk.details.col.id")}</TableHead>
                <TableHead>{t("disk.details.col.name")}</TableHead>
                <TableHead numeric>{t("disk.details.col.value")}</TableHead>
                <TableHead numeric>{t("disk.details.col.worst")}</TableHead>
                <TableHead numeric>{t("disk.details.col.limit")}</TableHead>
                <TableHead>{t("disk.details.col.raw")}</TableHead>
                <TableHead>{t("disk.details.col.kind")}</TableHead>
                <TableHead>{t("disk.details.col.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributes.map((a) => (
                <TableRow key={`${String(a.id)}-${a.attrname}`}>
                  <TableCell numeric>{a.id}</TableCell>
                  <TableCell className="py-2 [overflow-wrap:anywhere]">
                    <Identifier>{a.attrname}</Identifier>
                  </TableCell>
                  <TableCell numeric>{a.value}</TableCell>
                  <TableCell numeric>{a.worst}</TableCell>
                  <TableCell numeric>
                    {a.threshold === 0
                      ? t("disk.details.limitNone")
                      : a.threshold}
                  </TableCell>
                  <TableCell className="py-2">
                    <Identifier>{a.rawvalue}</Identifier>
                  </TableCell>
                  <TableCell className="py-2">
                    {a.prefailure
                      ? t("disk.details.kindPrefail")
                      : t("disk.details.kindAge")}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Assessment assessment={a.assessment} showOk />
                      {a.whenfailed.trim() === "" ||
                      a.whenfailed.trim() === "-" ? null : (
                        <span className="text-sm">{a.whenfailed}</span>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}

function TestResult({ entry }: { entry: SmartSelfTestLogEntry }) {
  const { t } = useTranslation();
  const result = testResultWord(entry.status);
  const own = entry.status.trim();
  let words: ReactNode;
  switch (result.word) {
    case "passed":
      return (
        <StatusPill status="ok">{t("disk.details.result.passed")}</StatusPill>
      );
    case "running":
      words = t("disk.details.result.running", {
        remaining: `${String(Number(entry.remaining) || 0)}%`,
      });
      break;
    case "aborted":
      words = t("disk.details.result.aborted");
      break;
    case "interrupted":
      words = t("disk.details.result.interrupted");
      break;
    case "failed":
      words = (
        <StatusPill status="critical">
          {t("disk.details.result.failed")}
        </StatusPill>
      );
      break;
    case "other":
      words = <StatusPill status="unknown">{result.text}</StatusPill>;
      break;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{words}</span>
      {result.word === "other" ? null : (
        <span className="text-xs text-muted-foreground">{own}</span>
      )}
    </span>
  );
}

function Block({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <>
      {splitSlots(t("disk.details.block", { value: SLOT }), [SLOT]).map(
        (part, i) =>
          "text" in part ? (
            <span key={`t${String(i)}`}>{part.text}</span>
          ) : (
            <Identifier key={`s${String(i)}`}>{value}</Identifier>
          ),
      )}
    </>
  );
}

function SelfTests({
  entries,
  poweronhours,
  device,
}: {
  entries: readonly SmartSelfTestLogEntry[];
  poweronhours: number | null;
  device: string;
}) {
  const { t } = useTranslation();
  const hours = useHours();
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p>{t("disk.details.testsEmpty")}</p>
        <p className="text-sm text-muted-foreground">
          {t("disk.details.testsEmptyHint")}
        </p>
      </div>
    );
  }
  return (
    <Table
      aria-label={t("disk.details.testsTableLabel", { device })}
      frameLabel={t("disk.details.testsTableLabel", { device })}
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t("disk.details.testsCol.when")}</TableHead>
          <TableHead>{t("disk.details.testsCol.test")}</TableHead>
          <TableHead>{t("disk.details.testsCol.result")}</TableHead>
          <TableHead>{t("disk.details.testsCol.firstProblem")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, i) => {
          const ago = hoursAgo(entry.lifetime, poweronhours);
          const kind = testKindWord(entry.description);
          const block = entry.lbaoffirsterror.trim();
          return (
            <TableRow key={`${entry.num}-${String(i)}`}>
              <TableCell className="py-2 tabular-nums">
                {ago === null
                  ? t("disk.details.testAtHours", {
                      hours: entry.lifetime.trim(),
                    })
                  : t("disk.details.testAgo", { duration: hours(ago) })}
              </TableCell>
              <TableCell className="py-2">
                {kind === "short"
                  ? t("disk.details.testShort")
                  : kind === "long"
                    ? t("disk.details.testLong")
                    : kind.text}
              </TableCell>
              <TableCell className="py-2">
                <TestResult entry={entry} />
              </TableCell>
              <TableCell className="py-2">
                {block === "" || block === "-" ? null : <Block value={block} />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PartSkeleton({ rows }: { rows: number }) {
  return <FactListSkeleton rows={rows} />;
}

export function DiskHealthDetails({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const headingId = useId();
  const device = disk.canonicaldevicefile;
  // The row's stable device file, never the address (UI-4).
  const params = { devicefile: disk.devicefile };
  const information = useSmartGetInformation(params, { query: ON_REQUEST });
  const attributes = useSmartGetAttributes(params, { query: ON_REQUEST });
  const tests = useSmartGetSelfTestLogs(params, { query: ON_REQUEST });
  const report = useSmartGetExtendedInformation(params, { query: ON_REQUEST });
  const [announcement, setAnnouncement] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const parts = [information, attributes, tests];
  const reading = parts.some((p) => p.isFetching);
  const read = parts.some((p) => p.data !== undefined || p.isError);
  const readAt = Math.max(
    ...parts.map((p) => Math.max(p.dataUpdatedAt, p.errorUpdatedAt)),
  );
  const allFailed = parts.every((p) => p.isError);

  const readDetails = () => {
    if (reading) {
      return;
    }
    setAnnouncement("");
    const reads: Promise<unknown>[] = parts.map((p) => p.refetch());
    if (reportOpen && report.data !== undefined) {
      reads.push(report.refetch());
    }
    void Promise.all(reads).then(() =>
      setAnnouncement(t("disk.details.announce", { device })),
    );
  };

  const openReport = (open: boolean) => {
    setReportOpen(open);
    if (open && report.data === undefined && !report.isFetching) {
      void report.refetch();
    }
  };

  const poweronhours =
    information.data === undefined
      ? null
      : hoursOf(information.data.poweronhours);

  const part = (
    name: PartName,
    query: (typeof parts)[number],
    content: () => ReactNode,
    skeletonRows: number,
  ) => {
    if (query.isFetching) {
      return <PartSkeleton rows={skeletonRows} />;
    }
    if (query.isError) {
      return (
        <PartFailed
          part={name}
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      );
    }
    return query.data === undefined ? null : content();
  };

  let reportBody: ReactNode = null;
  if (report.data !== undefined) {
    reportBody = (
      <TaskLog
        lines={reportLines(report.data)}
        label={t("disk.details.reportLabel", { device })}
        copyLabel={t("disk.details.reportCopy")}
        copiedLabel={t("common.copied")}
        selectedLabel={t("common.copySelected")}
        wrap={false}
        size="page"
        follow={false}
        busy={report.isFetching}
      />
    );
  } else if (report.isError && !report.isFetching) {
    reportBody = (
      <div className="flex flex-col items-start gap-2">
        <p>{t("disk.details.reportFailed")}</p>
        {isRpcError(report.error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {report.error.message}
          </ServerMessage>
        ) : null}
        <Button
          variant="neutral"
          size="sm"
          onClick={() => void report.refetch()}
        >
          {t("common.tryAgain")}
        </Button>
      </div>
    );
  } else if (report.isFetching) {
    reportBody = (
      <div
        aria-busy="true"
        className="flex flex-col gap-2 rounded-card bg-terminal p-3.5"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`block h-3 rounded-sm bg-terminal-muted/30 motion-safe:animate-pulse ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {t("disk.details.title")}
      </h2>
      {read ? null : (
        <p className="max-w-prose">
          {t("disk.details.intro")}
          {isAsleep(disk.powermode) ? <> {t("disk.details.asleep")}</> : null}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {read && !reading && readAt > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("disk.details.readAt", { time: format.clock(readAt) })}
          </p>
        ) : null}
        <Button
          variant="neutral"
          size={read ? "sm" : "md"}
          loading={reading}
          onClick={reading ? undefined : readDetails}
        >
          {reading
            ? t("disk.details.reading")
            : read
              ? t("disk.details.readAgain")
              : t("disk.details.read")}
        </Button>
      </div>
      <p role="status" className="text-sm empty:hidden">
        {reading ? t("disk.details.readingLine", { device }) : announcement}
      </p>

      {read || reading ? (
        <>
          {allFailed && !reading ? (
            <p className="text-sm">{t("disk.details.noPassThrough")}</p>
          ) : null}
          <h3 className="text-base font-semibold">{t("disk.details.about")}</h3>
          {part(
            "information",
            information,
            () => (information.data ? <About info={information.data} /> : null),
            5,
          )}
          <h3 className="text-base font-semibold">
            {t("disk.details.keyReadings")}
          </h3>
          {part(
            "readings",
            attributes,
            () =>
              attributes.data ? (
                <Readings attributes={attributes.data} device={device} />
              ) : null,
            5,
          )}
          <h3 className="text-base font-semibold">{t("disk.details.tests")}</h3>
          {part(
            "tests",
            tests,
            () =>
              tests.data ? (
                <SelfTests
                  entries={tests.data}
                  poweronhours={poweronhours}
                  device={device}
                />
              ) : null,
            3,
          )}
          {read ? (
            <Disclosure open={reportOpen} onOpenChange={openReport}>
              <DisclosureTrigger>
                {reportOpen
                  ? t("disk.details.reportHide")
                  : t("disk.details.reportShow")}
              </DisclosureTrigger>
              <DisclosurePanel keepMounted={false}>
                {reportBody}
              </DisclosurePanel>
            </Disclosure>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
