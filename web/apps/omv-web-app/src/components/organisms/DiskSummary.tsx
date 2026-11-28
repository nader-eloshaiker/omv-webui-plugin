// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's summary (phase 5 disks design 2.3, re-composed in step 5 of the redesign): its health in one
// sentence from the session's check (never read here: the check wakes every disk, so it starts on the
// Disk health page or the Disks list), the disk drawn as its kind beside its temperature and power state,
// what it holds with each file system's space used, and how to recognise it: model, serial number, size
// with the size on its label, connection, and the names that do not change. Everything from the server
// is text; the serial number stays on the page (never in the address, a title or a toast).
//
// The kind is only ever the one already read this session (the Disks page, the dashboard, or this page's
// "Read health details" share the cache entry); this page never reads it by itself, since the read can
// wake a sleeping disk. Until then the disk is drawn as a plain drive that claims no kind.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetInformationQueryKey,
  smartGetInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  driveKindOf,
  DrivePicture,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  PageSection,
  panelClass,
  StatusLabel,
} from "@omv-webui/react-ui-components";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import {
  degrees,
  labelSize,
  powerWord,
  tempStatus,
} from "../../disks/diskWords.ts";
import { fsAddress, fsUsage } from "../../filesystems/fsModel.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  useConfiguredFs,
  useDeviceSettings,
  useDiskInventory,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { AddStorageLink } from "../atoms/AddStorageLink.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";
import { DiskUseWords } from "../molecules/DisksUseLines.tsx";
import { FsUsageView } from "../molecules/FsStatus.tsx";

/** "3.6 TiB (4 TB on the label)", or the binary size alone when the label size cannot be told. */
function useDiskSize() {
  const { t } = useTranslation();
  return (size: string): string => {
    const bytes = parseByteCount(size);
    if (bytes === null) {
      return "";
    }
    const label = labelSize(bytes);
    return label === null
      ? formatBytes(bytes)
      : t("disk.fact.sizeLabel", {
          size: formatBytes(bytes),
          label: t("format.sizeDecimal", label),
        });
  };
}

/** The vendor before the model when it adds something: not empty, not the model's first word. */
function modelWithVendor(model: string, vendor: string): string {
  const m = model.trim();
  const v = vendor.trim();
  // "ATA" (the bus) and a PCI vendor number ("0x15ad") are not a maker's name.
  if (v === "" || v === "ATA" || /^0x[0-9a-f]+$/i.test(v)) {
    return m;
  }
  const first = m.split(/\s+/)[0] ?? "";
  return first.toLowerCase() === v.toLowerCase() ? m : `${v} ${m}`.trim();
}

/**
 * The disk's health in one sentence, from the session's check. A problem says what it means and what
 * to do (the reasons are written that way); before any check, why the check waits for the person.
 */
export function DiskHealthAnswer({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  if (check.result === undefined) {
    return (
      <div role="status" className="flex max-w-prose flex-col gap-pair">
        <p>{t("disk.answer.notChecked")}</p>
        <p>
          <Link to="/storage/smart/overview" className={routerLinkClass}>
            {t("disk.answer.check")}
          </Link>
        </p>
      </div>
    );
  }
  const reading = check.reading(disk.canonicaldevicefile);
  const checkedAt = (
    <span className="text-sm text-muted-foreground tabular-nums">
      {t("disk.fact.checkedAt", { time: format.clock(check.result.readAt) })}
    </span>
  );
  if (reading === undefined) {
    return (
      <p role="status" className="flex flex-wrap items-baseline gap-x-3">
        <span>{t("disk.answer.notReported")}</span>
        {checkedAt}
      </p>
    );
  }
  const state = diskState(reading.overallstatus);
  return (
    <div role="status" className="flex max-w-prose flex-col gap-line">
      {/* The status over its sentence, the same way for every state, so a problem reads as one. */}
      <StatusLabel status={state.status}>
        {t(`health.${state.status}`)}
      </StatusLabel>
      <p className="text-lg">
        {state.reason === null ? (
          t("disk.answer.ok")
        ) : (
          <DiskReason overallstatus={reading.overallstatus} />
        )}
      </p>
      <span className="mt-pair">{checkedAt}</span>
    </div>
  );
}

/**
 * The disk drawn as its kind, large, with what can be read off it at a glance: its kind, its
 * temperature against its limit, and whether it is awake.
 */
export function DiskAside({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const settings = useSmartSettings();
  const device = useDeviceSettings(disk.devicefile);
  // The kind read this session, if any: the cache entry only, never a read of its own (see the top).
  const information = useQuery({
    queryKey: getSmartGetInformationQueryKey({ devicefile: disk.devicefile }),
    // The same reader as the entry's other users, for when one of them reads it; never started here.
    queryFn: () => smartGetInformation({ devicefile: disk.devicefile }),
    enabled: false,
    retry: false,
  });
  const kind =
    driveKindOf(disk, information.data as { rotationrate?: unknown }) ?? "disk";
  const power = powerWord(disk.powermode);
  const reading =
    degrees(check.reading(disk.canonicaldevicefile)?.temperature) ??
    degrees(disk.temperature);
  // The disk's own limit when its settings say one; "no settings saved" means none of its own.
  const status = tempStatus(
    reading,
    device.data?.tempmax ?? 0,
    settings.data?.tempmax ?? 0,
  );
  return (
    <div
      className={panelClass({
        ground: "plate",
        className: "flex items-center gap-8",
      })}
    >
      <DrivePicture
        kind={kind}
        size="large"
        orientation="upright"
        className="shrink-0"
      />
      <dl className="flex min-w-0 flex-col gap-group">
        <div className="flex flex-col gap-line">
          <dt className="text-caption text-muted-foreground">
            {t("disk.fact.kind")}
          </dt>
          <dd>{t(`dashboard.kind.${kind === "disk" ? "unknown" : kind}`)}</dd>
        </div>
        <div className="flex flex-col gap-line">
          <dt className="text-caption text-muted-foreground">
            {t("disk.fact.temperature")}
          </dt>
          <dd className="flex flex-col items-start gap-line">
            {reading === null ? (
              <span className="text-muted-foreground">
                {power === "standby" || power === "sleep"
                  ? t("disk.aside.asleep")
                  : t("disk.fact.notRead")}
              </span>
            ) : (
              <span className="font-readout text-figure tabular-nums">
                {format.celsius(reading)}
              </span>
            )}
            {status === null ? null : (
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                <StatusLabel status={status.status}>
                  {t(`health.${status.status}`)}
                </StatusLabel>
                <span>
                  {status.status === "critical"
                    ? t("disk.fact.tempAtAlert", {
                        alert: format.celsius(status.alert),
                      })
                    : t("disk.fact.tempAtLimit", {
                        limit: format.celsius(status.limit),
                      })}
                </span>
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-line">
          <dt className="text-caption text-muted-foreground">
            {t("disk.fact.power")}
          </dt>
          <dd className={power === "unknown" ? "text-muted-foreground" : ""}>
            {t(`disks.power.${power}`)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** What the disk holds: each use in words, and a file system's space used under its name. */
export function DiskHolds({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const inventory = useDiskInventory();
  const configured = useConfiguredFs();
  const result = inventory.uses.get(disk.devicename);
  const rows = configured.data?.data ?? [];
  const rowOf = (address: string | null | undefined) =>
    address === null || address === undefined
      ? undefined
      : rows.find((row) => fsAddress(row) === address);
  return (
    <PageSection id="disk-holds" heading={t("disk.holds.title")}>
      {inventory.useState === "loading" || result === undefined ? (
        <p className="text-muted-foreground">{t("app.loading")}</p>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-group">
          {result.uses.map((use, i) => {
            const row =
              use.kind === "fsInUse" ||
              use.kind === "fsSetUp" ||
              use.kind === "fsUnused"
                ? rowOf(use.fs.address)
                : undefined;
            return (
              <li
                key={`${use.kind}-${String(i)}`}
                className="flex flex-col gap-pair"
              >
                <span>
                  <DiskUseWords use={use} />
                </span>
                {row === undefined ? null : (
                  <FsUsageView
                    row={row}
                    usage={fsUsage(row)}
                    label={t("filesystems.col.usage")}
                  />
                )}
                {use.kind === "fsInUse" && use.used ? (
                  <span className="text-sm text-muted-foreground">
                    {t("disk.fact.useShared")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {result !== undefined &&
      result.uses.every((u) => u.kind === "none" || u.kind === "wiped") &&
      result.blockers.length === 0 ? (
        <p>
          <AddStorageLink devicefile={disk.devicefile}>
            {t("disk.addStorage")}
          </AddStorageLink>
        </p>
      ) : null}
    </PageSection>
  );
}

function OtherNames({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const links = disk.devicelinks.filter((l) => l !== "");
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureTrigger>
        {open ? t("disk.names.hide") : t("disk.names.show")}
      </DisclosureTrigger>
      <DisclosurePanel className="gap-group">
        <p className="max-w-prose text-sm">
          {t("disk.names.intro", { device: disk.canonicaldevicefile })}
        </p>
        <FactList>
          <FactListItem>
            <FactListLabel>{t("disk.names.stable")}</FactListLabel>
            <FactListValue variant="identifier">
              {disk.devicefile}
            </FactListValue>
          </FactListItem>
          {links.length > 0 ? (
            <FactListItem>
              <FactListLabel>{t("disk.names.links")}</FactListLabel>
              <FactListValue variant="identifier">
                <ul>
                  {links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </FactListValue>
            </FactListItem>
          ) : null}
          {disk.wwn.trim() === "" ? null : (
            <FactListItem>
              <FactListLabel>{t("disk.names.wwn")}</FactListLabel>
              <FactListValue variant="identifier">{disk.wwn}</FactListValue>
            </FactListItem>
          )}
        </FactList>
      </DisclosurePanel>
    </Disclosure>
  );
}

/** How to recognise the disk: model, serial number, size and connection, and its other names. */
export function DiskAbout({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const sizeOf = useDiskSize();
  const model = modelWithVendor(disk.model, disk.vendor);
  const serial = disk.serialnumber.trim();
  const size = sizeOf(disk.size);
  return (
    <PageSection id="disk-about" heading={t("disk.about.title")}>
      <FactList className="max-w-3xl">
        <FactListItem>
          <FactListLabel>{t("disk.fact.model")}</FactListLabel>
          <FactListValue variant={model === "" ? "missing" : "text"}>
            {model === "" ? t("disks.noModel") : model}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("disk.fact.serial")}</FactListLabel>
          {serial === "" ? (
            <FactListValue variant="missing">
              {t("common.notReported")}
            </FactListValue>
          ) : (
            <FactListValue>
              <span className="flex flex-wrap items-center gap-2">
                <Identifier>{serial}</Identifier>
                <CopyButton
                  text={serial}
                  label={t("disk.fact.copySerial")}
                  copiedLabel={t("common.copied")}
                  selectedLabel={t("common.copySelected")}
                  size="icon-sm"
                />
              </span>
            </FactListValue>
          )}
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("disk.fact.size")}</FactListLabel>
          <FactListValue variant={size === "" ? "missing" : "text"}>
            {size === "" ? t("common.notReported") : size}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("disk.fact.connection")}</FactListLabel>
          <FactListValue>
            {disk.hotpluggable
              ? t("disk.fact.removable")
              : t("disk.fact.builtIn")}
          </FactListValue>
        </FactListItem>
      </FactList>
      <OtherNames disk={disk} />
      {disk.israid ? (
        <p className="max-w-prose text-sm">{t("disk.hardwareRaid")}</p>
      ) : null}
    </PageSection>
  );
}

/** The page's sections as links, so a pro reaches one without scrolling past the rest. */
export function DiskOnThisPage() {
  const { t } = useTranslation();
  const items = [
    ["disk-holds", t("disk.holds.title")],
    ["disk-about", t("disk.about.title")],
    ["disk-health-details", t("disk.details.title")],
    ["disk-monitoring", t("disk.monitoring.title")],
    ["disk-power", t("disk.power.title")],
    ["disk-wipe", t("wipe.title")],
  ] as const;
  return (
    <nav aria-label={t("disk.onThisPage")}>
      <ul className="flex flex-wrap gap-x-5 gap-y-pair text-sm">
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} className={routerLinkClass}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
