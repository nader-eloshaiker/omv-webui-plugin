// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's power settings (phase 5 disks design 2.7): when it spins down, its own power-saving and noise
// levels, and its write cache. They come from the row's `hdparm` in DiskMgmt.getList (absent when
// nothing is saved). OMV sends all four to the disk and has no way to remove them, so the form is shown
// only after "Choose power settings", which says so (D18), and it starts with the write cache on (P6).
// Saving marks the disk-health module pending, like every setting of this slice.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  getDiskMgmtGetListQueryKey,
  useDiskMgmtSetHdParm,
  type DiskDeviceList,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  InlineAlert,
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { spinDownSeconds } from "../../disks/diskWords.ts";
import {
  AAM_LISTED,
  APM_LISTED,
  APM_SPIN_DOWN,
  APM_SPINNING,
  isPowerDirty,
  monitoringKeepsAwake,
  powerRequest,
  SPINDOWN_HOURS,
  SPINDOWN_LISTED,
  SPINDOWN_MINUTES,
  startingDraft,
  type Aam,
  type PowerDraft,
} from "../../disks/powerForm.ts";
import { useFormat } from "../../format/useFormat.ts";
import {
  ALL_DISKS,
  useDeviceSettings,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";

export function DiskPowerSettings({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const headingId = useId();
  const [chosen, setChosen] = useState(false);
  const saved = disk.hdparm;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("disk.power.title")}
      </h2>
      {saved === undefined && !chosen ? (
        <div className="flex max-w-prose flex-col items-start gap-2">
          <p>{t("disk.power.notSet")}</p>
          <Button variant="neutral" onClick={() => setChosen(true)}>
            {t("disk.power.choose")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("disk.power.noRemove")}
          </p>
        </div>
      ) : (
        <PowerForm disk={disk} focusFirst={saved === undefined} />
      )}
    </section>
  );
}

function PowerForm({
  disk,
  focusFirst,
}: {
  disk: DiskDevice;
  /** The form was just revealed by "Choose power settings": focus goes to its first field. */
  focusFirst: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const save = useDiskMgmtSetHdParm();
  const settings = useSmartSettings();
  const device = useDeviceSettings(disk.devicefile);
  const pending = useSmartPending();
  const saved = disk.hdparm;
  const [draft, setDraft] = useState<PowerDraft | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const alertRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const noChangesId = useId();
  const spindownHintId = useId();
  const apmHintId = useId();
  const aamHintId = useId();

  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) {
      setSavedNotice(false);
    }
  }

  useEffect(() => {
    if (focusFirst) {
      firstRef.current?.focus();
    }
  }, [focusFirst]);

  const values = draft ?? startingDraft(saved);
  // Nothing saved yet: the starting values are themselves the change to save.
  const dirty =
    saved === undefined || (draft !== null && isPowerDirty(saved, draft));
  const saving = save.isPending;
  const failure = save.error;

  useEffect(() => {
    if (failure) {
      alertRef.current?.focus();
    }
  }, [failure]);

  const edit = (change: Partial<PowerDraft>) => {
    setDraft({ ...values, ...change });
    setSavedNotice(false);
  };

  const spinDownLabel = (value: number): string => {
    if (value === 0) {
      return t("disk.power.never");
    }
    const seconds = spinDownSeconds(value);
    return seconds === null ? String(value) : format.duration(seconds);
  };
  const spinDownItems = [
    ...SPINDOWN_LISTED.map((value) => ({
      value: String(value),
      label: spinDownLabel(value),
    })),
    ...(SPINDOWN_LISTED.includes(values.spindowntime)
      ? []
      : [
          {
            value: String(values.spindowntime),
            label: t("disk.power.setElsewhere", {
              value: spinDownLabel(values.spindowntime),
            }),
          },
        ]),
  ];
  const apmLabel = (value: number): string =>
    APM_LISTED.includes(value)
      ? t(`disk.power.apm.${String(value) as "0"}`)
      : t("disk.power.apm.other", { value: String(value) });
  const apmItems = [
    ...APM_LISTED.map((value) => ({
      value: String(value),
      label: apmLabel(value),
    })),
    ...(APM_LISTED.includes(values.apm)
      ? []
      : [{ value: String(values.apm), label: apmLabel(values.apm) }]),
  ];
  const aamItems = AAM_LISTED.map((value) => ({
    value: String(value),
    label: t(`disk.power.aam.${String(value) as "0"}`),
  }));
  const label = (items: { value: string; label: string }[], value: number) =>
    items.find((i) => i.value === String(value))?.label ?? String(value);

  const keepsAwake = monitoringKeepsAwake({
    spindowntime: values.spindowntime,
    watched: device.data?.enable === true,
    monitoringOn: settings.data?.enable === true,
    powermode: settings.data?.powermode,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving) {
      return;
    }
    save.reset();
    const key = getDiskMgmtGetListQueryKey(ALL_DISKS);
    save.mutate(
      { data: powerRequest(disk, saved, values) },
      {
        onSuccess: (stored) => {
          queryClient.setQueryData<DiskDeviceList>(key, (list) =>
            list === undefined
              ? list
              : {
                  ...list,
                  data: list.data.map((row) =>
                    row.devicename === disk.devicename
                      ? { ...row, hdparm: stored }
                      : row,
                  ),
                },
          );
          // The reply is the stored object, which DiskMgmt.getList reports from now on (saved and
          // not applied, as captured); reading the list again here would add nothing, and on the
          // mock, which keeps nothing, it would undo the form's saved state.
          setDraft(null);
          setSavedNotice(true);
        },
      },
    );
  };

  const discard = () => {
    setDraft(null);
    save.reset();
  };

  const extraSpinDown = spinDownItems.slice(SPINDOWN_LISTED.length);

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={t("disk.power.title")}
      className="flex max-w-[40rem] flex-col gap-5"
    >
      <LeaveGuard when={draft !== null && dirty} />
      <p className="max-w-prose">{t("disk.power.intro")}</p>
      {failure ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("disk.power.saveFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}

      <div className="flex max-w-sm flex-col gap-1">
        <Select
          items={spinDownItems}
          value={String(values.spindowntime)}
          readOnly={saving}
          onValueChange={(value) => edit({ spindowntime: Number(value) })}
        >
          <SelectLabel>{t("disk.power.spindown")}</SelectLabel>
          <SelectTrigger ref={firstRef} aria-describedby={spindownHintId} />
          <SelectContent>
            <SelectItem value="0">{t("disk.power.never")}</SelectItem>
            <SelectGroup>
              <SelectGroupLabel>
                {t("disk.power.groupMinutes")}
              </SelectGroupLabel>
              {SPINDOWN_MINUTES.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {label(spinDownItems, value)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectGroupLabel>{t("disk.power.groupHours")}</SelectGroupLabel>
              {SPINDOWN_HOURS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {label(spinDownItems, value)}
                </SelectItem>
              ))}
            </SelectGroup>
            {extraSpinDown.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={spindownHintId} className="text-sm text-muted-foreground">
          {t("disk.power.spindownHint")}
        </p>
      </div>
      {keepsAwake ? (
        <InlineAlert tone="neutral" role="note">
          <p>
            {t("disk.power.monitorWakes", {
              interval: format.interval(settings.data?.interval ?? 0),
            })}
          </p>
          <p>
            <Link to="/storage/smart/settings" className={routerLinkClass}>
              {t("disk.monitoring.settingsLink")}
            </Link>
          </p>
        </InlineAlert>
      ) : null}

      <div className="flex max-w-sm flex-col gap-1">
        <Select
          items={apmItems}
          value={String(values.apm)}
          readOnly={saving}
          onValueChange={(value) => edit({ apm: Number(value) })}
        >
          <SelectLabel>{t("disk.power.apm.label")}</SelectLabel>
          <SelectTrigger aria-describedby={apmHintId} />
          <SelectContent>
            <SelectItem value="0">{apmLabel(0)}</SelectItem>
            <SelectGroup>
              <SelectGroupLabel>
                {t("disk.power.apm.groupSpinDown")}
              </SelectGroupLabel>
              {APM_SPIN_DOWN.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {apmLabel(value)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectGroupLabel>
                {t("disk.power.apm.groupSpinning")}
              </SelectGroupLabel>
              {APM_SPINNING.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {apmLabel(value)}
                </SelectItem>
              ))}
            </SelectGroup>
            {apmItems.slice(APM_LISTED.length).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={apmHintId} className="text-sm text-muted-foreground">
          {t("disk.power.apmHint")}
        </p>
      </div>

      <div className="flex max-w-sm flex-col gap-1">
        <Select
          items={aamItems}
          value={String(values.aam)}
          readOnly={saving}
          onValueChange={(value) => edit({ aam: Number(value) as Aam })}
        >
          <SelectLabel>{t("disk.power.aam.label")}</SelectLabel>
          <SelectTrigger aria-describedby={aamHintId} />
          <SelectContent>
            {aamItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={aamHintId} className="text-sm text-muted-foreground">
          {t("disk.power.aamHint")}
        </p>
      </div>

      <CheckboxField
        label={t("disk.power.writeCache")}
        hint={t("disk.power.writeCacheHint")}
        checked={values.writecache}
        readOnly={saving}
        onCheckedChange={(checked: boolean) => edit({ writecache: checked })}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant={dirty ? "primary" : "neutral"}
            loading={saving}
            disabled={!dirty}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={draft === null || saving}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
            onClick={discard}
          >
            {t("common.discard")}
          </Button>
          {dirty ? null : (
            <span id={noChangesId} className="text-sm text-muted-foreground">
              {t("common.noChanges")}
            </span>
          )}
        </div>
        <p role="status" className="text-sm text-foreground empty:hidden">
          {savedNotice ? t("common.savedPending") : ""}
        </p>
      </div>
    </form>
  );
}
