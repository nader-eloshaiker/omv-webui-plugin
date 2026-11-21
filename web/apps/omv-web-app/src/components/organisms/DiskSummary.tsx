// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's summary card (phase 5 disks design 2.3): what it holds, its health from the session's check
// (never read here: the check wakes every disk, so it starts on the Disk health page or the Disks list),
// its temperature against its limit, its power state as a word, and how to recognise it: model, serial
// number, size with the size on its label, connection, and the names that do not change. Everything from
// the server is text; the serial number stays on the page (never in the address, a title or a toast).
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  Card,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  degrees,
  labelSize,
  powerWord,
  tempStatus,
} from "../../disks/diskWords.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  useDeviceSettings,
  useDiskInventory,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { AddStorageLink } from "../atoms/AddStorageLink.tsx";
import { DiskHealthStatus } from "../molecules/DiskHealthStatus.tsx";
import { DiskUseWords } from "../molecules/DisksUseLines.tsx";

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

function UsedFor({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const inventory = useDiskInventory();
  const result = inventory.uses.get(disk.devicename);
  if (inventory.useState === "loading" || result === undefined) {
    return <FactListValue variant="missing">{t("app.loading")}</FactListValue>;
  }
  return (
    <FactListValue>
      <ul className="flex flex-col gap-0.5">
        {result.uses.map((use, i) => (
          <li key={`${use.kind}-${String(i)}`}>
            <DiskUseWords use={use} />
            {use.kind === "fsInUse" && use.used ? (
              <span className="block text-sm text-muted-foreground">
                {t("disk.fact.useShared")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {result.uses.every((u) => u.kind === "none" || u.kind === "wiped") &&
      result.blockers.length === 0 ? (
        <span className="mt-1 block">
          <AddStorageLink devicefile={disk.devicefile}>
            {t("disk.addStorage")}
          </AddStorageLink>
        </span>
      ) : null}
    </FactListValue>
  );
}

function Health({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  if (check.result === undefined) {
    return (
      <FactListValue>
        <span className="block">{t("disk.fact.healthNotChecked")}</span>
        <Link to="/storage/smart/overview" className={routerLinkClass}>
          {t("disk.fact.healthCheckLink")}
        </Link>
      </FactListValue>
    );
  }
  return (
    <FactListValue>
      <DiskHealthStatus
        checked
        reading={check.reading(disk.canonicaldevicefile)}
      />
      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
        {t("disk.fact.checkedAt", { time: format.clock(check.result.readAt) })}
      </span>
    </FactListValue>
  );
}

function Temperature({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const settings = useSmartSettings();
  const device = useDeviceSettings(disk.devicefile);
  const fromCheck = degrees(
    check.reading(disk.canonicaldevicefile)?.temperature,
  );
  const reading = fromCheck ?? degrees(disk.temperature);
  if (reading === null) {
    return (
      <FactListValue variant="missing">{t("disk.fact.notRead")}</FactListValue>
    );
  }
  // The disk's own limit when its settings say one; "no settings saved" means none of its own.
  const ownLimit = device.data?.tempmax ?? 0;
  const status = tempStatus(reading, ownLimit, settings.data?.tempmax ?? 0);
  return (
    <FactListValue>
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{format.celsius(reading)}</span>
        {status === null ? null : (
          <>
            <StatusPill status={status.status}>
              {t(`health.${status.status}`)}
            </StatusPill>
            <span className="text-sm">
              {status.status === "critical"
                ? t("disk.fact.tempAtAlert", {
                    alert: format.celsius(status.alert),
                  })
                : t("disk.fact.tempAtLimit", {
                    limit: format.celsius(status.limit),
                  })}
            </span>
          </>
        )}
      </span>
    </FactListValue>
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
      <DisclosurePanel className="gap-3">
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

export function DiskSummary({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const sizeOf = useDiskSize();
  const model = modelWithVendor(disk.model, disk.vendor);
  const serial = disk.serialnumber.trim();
  const size = sizeOf(disk.size);
  const power = powerWord(disk.powermode);
  return (
    <section aria-label={t("disk.fact.use")} className="flex flex-col gap-3">
      <Card className="flex flex-col gap-4 p-4">
        <FactList className="lg:grid-cols-2">
          <FactListItem>
            <FactListLabel>{t("disk.fact.use")}</FactListLabel>
            <UsedFor disk={disk} />
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("disk.fact.health")}</FactListLabel>
            <Health disk={disk} />
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("disk.fact.temperature")}</FactListLabel>
            <Temperature disk={disk} />
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("disk.fact.power")}</FactListLabel>
            <FactListValue variant={power === "unknown" ? "missing" : "text"}>
              {t(`disks.power.${power}`)}
            </FactListValue>
          </FactListItem>
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
      </Card>
      {disk.israid ? <p className="text-sm">{t("disk.hardwareRaid")}</p> : null}
    </section>
  );
}
