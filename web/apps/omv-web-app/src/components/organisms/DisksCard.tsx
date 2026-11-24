// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Disks card (phase 5 design 1.3; dashboard spec 9): the NAS's front panel, one caddy
// per disk of DiskMgmt.getList (read on opening, never polled, and it never wakes a disk), with the
// session's disk-health reading, what each disk holds and one quiet fact.
//
// Nothing reads disk health on its own: not on page load, a timer, window focus or a reload (owner).
// Reading it wakes sleeping disks, so the card says so (behind "Why do I have to ask?") and waits for
// "Check disk health". The check is a task (Smart.getListBg) followed by the one registry; its result
// is kept in memory for the session (diskHealth.ts). The one button keeps its place, so focus stays
// on it while it turns into "Checking…" and then "Check again".
//
// Fail closed: what a disk holds is left out while any of its inputs is missing or failed, so the bay
// never suggests that a disk is free (dashboard/driveBay.ts). The inputs are only the reads that
// wake no disk; with the RAID or ZFS plugin installed the roles are left out (hooks/useBayUses.ts).
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { getDiskMgmtGetListQueryOptions } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  DriveBay,
  DriveBaySkeleton,
  EmptyState,
  HealthList,
  HealthListItem,
  InlineAlert,
  ServerMessage,
  StatusPill,
  type DriveSlot,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  diskState,
  diskTemperature,
  sortDisks,
} from "../../dashboard/dashboard.ts";
import {
  BAY_SLOTS,
  baySlots,
  type BayHealth,
  type BayRole,
} from "../../dashboard/driveBay.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useBayUses } from "../../hooks/useBayUses.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { ALL_DISKS } from "../../hooks/useDiskReads.ts";
import { useDiskRollUp } from "../../hooks/useDiskRollUp.ts";
import { useForegroundRead } from "../../hooks/useMonitoringReads.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

/** One disk of the check, for "Disk details": model and size, temperature, reason, monitoring. */
function DiskItem({ disk }: { disk: SmartDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const state = diskState(disk.overallstatus);
  const size = parseByteCount(disk.size);
  const sizeText = size === null ? "" : formatBytes(size);
  const model = disk.model.trim();
  const temperature = diskTemperature(disk.temperature);
  // The model is server text inside our "{{model}}, {{size}}": isolated, so a right-to-left model
  // keeps its direction without reordering the rest.
  const modelSize =
    model === "" ? (
      sizeText
    ) : sizeText === "" ? (
      <bdi>{model}</bdi>
    ) : (
      <Slotted
        sentence={(tokens) => t("dashboard.disks.modelSize", tokens)}
        values={{ model, size: sizeText }}
      />
    );
  const temperatureText =
    temperature === null ? "" : format.celsius(temperature);
  const detail =
    model === "" && sizeText === "" ? (
      temperatureText
    ) : (
      <>
        {modelSize}
        {temperatureText === "" ? null : ` · ${temperatureText}`}
      </>
    );
  return (
    <HealthListItem
      status={state.status}
      statusLabel={t(`health.${state.status}`)}
      name={
        <DiskLink
          devicename={disk.devicename}
          device={disk.canonicaldevicefile}
        />
      }
      nameVariant="identifier"
      detail={detail === "" ? undefined : detail}
      reason={
        state.reason === null ? undefined : (
          <DiskReason overallstatus={disk.overallstatus} />
        )
      }
      note={disk.monitor ? undefined : t("dashboard.disks.monitorOff")}
    />
  );
}

function MonitoringAdvice({ disks }: { disks: readonly SmartDevice[] }) {
  const { t } = useTranslation();
  const off = disks.filter((d) => !d.monitor).length;
  if (off === 0) {
    return null;
  }
  if (off === disks.length) {
    return (
      <InlineAlert tone="neutral" role="note">
        <p>{t("dashboard.disks.monitorOffAll")}</p>
        <p>
          <Link to="/storage/smart/set-up" className={routerLinkClass}>
            {t("dashboard.disks.monitorOffAllLink")}
          </Link>
        </p>
      </InlineAlert>
    );
  }
  return (
    <p className="text-sm">
      {t("dashboard.disks.monitorOffSome", { count: off, total: disks.length })}{" "}
      <Link to="/storage/smart/set-up" className={routerLinkClass}>
        {t("dashboard.disks.monitorOffSomeLink")}
      </Link>
    </p>
  );
}

function useSlotWords() {
  const { t } = useTranslation();
  const health = (h: BayHealth): string =>
    h.kind === "notChecked"
      ? t("dashboard.area.notChecked")
      : h.kind === "noReading"
        ? t("dashboard.area.noReading")
        : t(`health.${h.status}`);
  const role = (r: BayRole): string => {
    switch (r.kind) {
      case "system":
        return t("dashboard.bay.role.system");
      case "fs":
        return r.name;
      case "notMounted":
        return t("dashboard.bay.role.notMounted", { name: r.name });
      case "creating":
        return t("dashboard.bay.role.creating");
      case "swap":
        return t("dashboard.bay.role.swap");
      case "raid":
        return t("dashboard.bay.role.raid", { name: r.name });
      case "zfs":
        return t("dashboard.bay.role.zfs", { pool: r.pool });
      case "wiping":
        return t("dashboard.bay.role.wiping");
      case "none":
        return t("dashboard.bay.role.none");
    }
  };
  return { health, role };
}

export function DisksCard({
  hostname,
  className,
  index,
}: {
  /** The name on the chassis. */
  hostname: string | undefined;
  /** Its place in the page grid, and in the rise-in order. */
  className?: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const words = useSlotWords();
  const inventory = useBayUses();
  const check = useDiskCheck();
  const read = useForegroundRead();
  const summarise = useDiskRollUp();
  // A check that ends while the card is on screen is announced; one that ended before is not.
  const [openedAt] = useState(Date.now);

  const { disks, diskList } = inventory;
  const checking = check.checking;
  const result = check.result;
  const checked = result ? sortDisks(result.list.data) : undefined;
  const summary = checked ? summarise(checked) : null;

  let announcement = "";
  if (checking) {
    announcement = t("diskCheck.checkingLine");
  } else if (result && result.readAt >= openedAt && !check.failed && summary) {
    announcement = t("diskCheck.announce", { summary: summary.text });
  }

  let meta: ReactNode = null;
  if (checking) {
    meta = (
      <span>
        {result
          ? t("diskCheck.checkingAgain", { time: format.clock(result.readAt) })
          : t("diskCheck.checkingLine")}
      </span>
    );
  } else if (result) {
    meta = (
      <>
        {summary ? (
          <>
            <StatusPill status={summary.status}>
              {t(`health.${summary.status}`)}
            </StatusPill>
            <span className="text-foreground">{summary.text}</span>
          </>
        ) : null}
        <span className="basis-full">
          {t("dashboard.disks.checkedAt", {
            time: format.clock(result.readAt),
          })}
        </span>
      </>
    );
  } else if (disks !== undefined) {
    meta = (
      <span>
        {t("dashboard.disks.notCheckedMeta", { count: disks.length })}
      </span>
    );
  }

  const button = (
    <Button
      variant="neutral"
      loading={checking}
      onClick={checking ? undefined : check.start}
    >
      {checking
        ? t("diskCheck.checking")
        : result || check.failed
          ? t("diskCheck.checkAgain")
          : t("diskCheck.check")}
    </Button>
  );

  const details =
    checked !== undefined && checked.length > 0 ? (
      <HealthList aria-label={t("dashboard.disks.listLabel")}>
        {checked.map((disk) => (
          <DiskItem key={disk.canonicaldevicefile} disk={disk} />
        ))}
      </HealthList>
    ) : null;

  let bay: ReactNode;
  if (disks === undefined && diskList.isError) {
    // The bay cannot be drawn; a check's result is still listed.
    bay = (
      <>
        <ReadFailed
          error={diskList.error}
          retrying={diskList.isFetching}
          onRetry={() => void read(getDiskMgmtGetListQueryOptions(ALL_DISKS))}
          className="py-4"
        >
          {t("disks.loadFailed")}
        </ReadFailed>
        {details}
      </>
    );
  } else if (disks === undefined) {
    bay = <DriveBaySkeleton />;
  } else if (disks.length === 0) {
    bay = (
      <EmptyState
        className="py-4"
        action={
          <Link to="/storage/disks" className={routerLinkClass}>
            {t("dashboard.disks.openDisks")}
          </Link>
        }
      >
        {t("disks.empty")}
      </EmptyState>
    );
  } else {
    const slots: DriveSlot[] = baySlots(
      disks,
      inventory.uses,
      inventory.known,
      result?.list.data,
    ).map((slot) => ({
      id: slot.devicename,
      device: slot.devicename,
      kind: slot.kind,
      status: slot.health.kind === "read" ? slot.health.status : "unknown",
      // Before any check the header says it once; each slot keeps the word for screen readers only.
      statusLabel:
        slot.health.kind === "notChecked" ? (
          <span className="sr-only">{words.health(slot.health)}</span>
        ) : (
          words.health(slot.health)
        ),
      role: slot.role === null ? undefined : words.role(slot.role),
      detail:
        slot.temperature !== null
          ? format.celsius(slot.temperature)
          : slot.asleep
            ? t("dashboard.disks.asleep")
            : undefined,
      link: slot.linked ? (
        <Link to="/storage/disks/$disk" params={{ disk: slot.devicename }} />
      ) : undefined,
    }));
    const more = disks.length - BAY_SLOTS;
    bay = (
      <>
        <DriveBay
          aria-label={t("dashboard.disks.bayLabel")}
          name={hostname}
          slots={slots}
        />
        {more > 0 ? (
          <p className="text-sm">
            <Link to="/storage/disks" className={routerLinkClass}>
              {t("dashboard.disks.more", { count: more })}
            </Link>
          </p>
        ) : null}
        {checked !== undefined && checked.length === 0 ? (
          <p className="max-w-prose text-sm">{t("dashboard.disks.empty")}</p>
        ) : null}
        {checked !== undefined && checked.length > 0 ? (
          <MonitoringAdvice disks={checked} />
        ) : null}
        {/* Keyed: the two disclosures sit in one place, and neither may inherit the other's state. */}
        {result === undefined ? (
          <Disclosure key="why">
            <DisclosureTrigger variant="inline">
              {t("dashboard.disks.why")}
            </DisclosureTrigger>
            <DisclosurePanel>
              <p className="max-w-prose text-sm text-muted-foreground">
                {t("dashboard.disks.intro")}
              </p>
            </DisclosurePanel>
          </Disclosure>
        ) : details !== null ? (
          <Disclosure key="details">
            <DisclosureTrigger variant="inline">
              {t("dashboard.disks.details")}
            </DisclosureTrigger>
            <DisclosurePanel>{details}</DisclosurePanel>
          </Disclosure>
        ) : null}
      </>
    );
  }

  return (
    <DashboardCard
      title={t("dashboard.disks.title")}
      meta={meta}
      action={button}
      busy={disks === undefined && !diskList.isError}
      busyLabel={t("disks.loading")}
      className={className}
      index={index}
      footer={
        <>
          <Link to="/storage/disks" className={routerLinkClass}>
            {t("dashboard.disks.openDisks")}
          </Link>
          <Link to="/storage/smart/overview" className={routerLinkClass}>
            {t("dashboard.disks.link")}
          </Link>
        </>
      }
    >
      {check.failed ? (
        <InlineAlert tone="critical" title={t("diskCheck.failed")}>
          {isRpcError(check.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {check.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      {bay}
      {/* Said once per change; the header already shows the words. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </DashboardCard>
  );
}
