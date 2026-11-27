// SPDX-License-Identifier: GPL-3.0-or-later
// The disks' temperatures on the dashboard (owner, 2026-11-26, "The charts are settled"): by kind,
// each ZFS pool a group of its own, every disk drawn as a picture of its kind with a filled level on
// one shared scale and the alert limit as one dashed line. Every disk up to eight; past that the
// groups with a disk over the limit, the rest summed up in a sentence that opens them in place. A
// disk over the limit is never hidden.
//
// The figures are DiskMgmt.getList's, which never wakes a disk, so a sleeping disk has none; its kind
// is from Smart.getInformation, read only while it was awake (journal 2026-11-27). The alert limit is
// Smart.getSettings `tempmax`. RAID arrays are not read here, so their disks stand with their kind.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  cn,
  DiskTemperatures,
  EmptyState,
  Skeleton,
  type DiskGroup,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useNasWords } from "../../hooks/useNasWords.ts";

/** "10:31", on this computer's clock. */
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

export function DashboardTemperatures({
  groups,
  state,
  error,
  readAt,
  retrying,
  onRetry,
  id,
  className,
}: {
  groups: readonly DiskGroup[];
  /** DiskMgmt.getList, as the page has it. */
  state: "loading" | "failed" | "ok";
  error: unknown;
  /** When the disk list arrived, on this computer's clock (ms). */
  readAt: number;
  retrying: boolean;
  onRetry: () => void;
  /** Where the scan line's Disks lands: the section takes focus there. */
  id?: string;
  /** The ground it stands on, from the page (`panelClass`). */
  className?: string;
}) {
  const { t } = useTranslation();
  const words = useNasWords();
  const titleId = useId();
  const time = clock(readAt);

  let body;
  if (state === "loading") {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t("dashboard.temps.loading")}</span>
        <Skeleton shape="block" className="h-24 w-full max-w-xl" />
      </div>
    );
  } else if (state === "failed") {
    body = (
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
        {t("dashboard.temps.loadFailed")}
      </EmptyState>
    );
  } else if (groups.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t("dashboard.temps.none")}
      </p>
    );
  } else {
    body = (
      <DiskTemperatures
        mode="dashboard"
        groups={groups}
        labels={words.temperatures(time)}
        restLabels={words.rest}
      />
    );
  }

  return (
    <section
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      aria-labelledby={titleId}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <header className="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5">
        <h2 id={titleId} className="text-section text-foreground">
          {t("dashboard.temps.title")}
        </h2>
        {state === "ok" && groups.length > 0 ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("dashboard.temps.readAt", { time })}
          </p>
        ) : null}
      </header>
      {body}
    </section>
  );
}
