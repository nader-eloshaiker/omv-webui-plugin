// SPDX-License-Identifier: GPL-3.0-or-later
// Whether the NAS watches this disk (phase 5 disks design 2.5): a small settings form, saved and then
// applied in the band. The settings are read with the row's stable device file. OMV answers a disk with
// no settings saved with one exact error (captured on the test VM); only that reply means "not
// watched", and a save then creates the settings with OMV's new-object identifier. Any other failure is
// an error, never taken for "off". Watching cannot be turned off while scheduled self-tests refer to
// the disk (D13). The scheduled self-tests themselves follow the form (`children`, design 2.6).
import type {
  DiskDevice,
  SmartDeviceSettings,
} from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetDeviceSettingsQueryKey,
  useSmartSetDeviceSettings,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  NumberField,
  RadioGroupField,
  RadioOption,
  ServerMessage,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import { ALERT_MARGIN, isNoDeviceSettings } from "../../disks/diskWords.ts";
import {
  isMonitoringDirty,
  limitProblem,
  monitoringDraft,
  monitoringRequest,
  ownLimit,
  watchLocked,
  type MonitoringDraft,
} from "../../disks/monitoringForm.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  useDeviceSettings,
  useScheduleList,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

export function DiskMonitoring({
  disk,
  children,
}: {
  disk: DiskDevice;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const device = useDeviceSettings(disk.devicefile);
  const noSettings = isNoDeviceSettings(device.error);

  let form;
  if (device.data === undefined && device.isError && !noSettings) {
    form = (
      <ReadFailed
        error={device.error}
        retrying={device.isFetching}
        onRetry={() => void device.refetch()}
      >
        {t("disk.monitoring.loadFailed")}
      </ReadFailed>
    );
  } else if (device.data === undefined && !noSettings) {
    form = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <p role="status" className="sr-only">
          {t("app.loading")}
        </p>
        <Skeleton aria-hidden="true" className="w-56" />
        <Skeleton aria-hidden="true" className="w-80" />
      </div>
    );
  } else {
    form = <MonitoringForm disk={disk} saved={device.data ?? null} />;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("disk.monitoring.title")}
      </h2>
      {form}
      {children}
    </section>
  );
}

function MonitoringForm({
  disk,
  saved,
}: {
  disk: DiskDevice;
  saved: SmartDeviceSettings | null;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const save = useSmartSetDeviceSettings();
  const settings = useSmartSettings();
  const schedule = useScheduleList();
  const check = useDiskCheck();
  const pending = useSmartPending();
  const [draft, setDraft] = useState<MonitoringDraft | null>(null);
  const [limitError, setLimitError] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const alertRef = useRef<HTMLDivElement>(null);
  const limitRef = useRef<HTMLInputElement>(null);
  const noChangesId = useId();

  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) {
      setSavedNotice(false);
    }
  }

  const values = draft ?? monitoringDraft(saved);
  const dirty = draft !== null && isMonitoringDirty(saved, draft);
  const saving = save.isPending;
  const failure = save.error;

  useEffect(() => {
    if (failure) {
      alertRef.current?.focus();
    }
  }, [failure]);

  const edit = (change: Partial<MonitoringDraft>) => {
    setDraft({ ...values, ...change });
    setSavedNotice(false);
  };

  const names = diskNames(disk);
  const tests =
    schedule.data?.data.filter((e) => belongsTo(e.devicefile, names)).length ??
    0;
  const locked = watchLocked(saved);
  const globalLimit = settings.data?.tempmax ?? 0;
  const globalOff = settings.data !== undefined && !settings.data.enable;
  const notInCheck =
    check.result !== undefined &&
    check.reading(disk.canonicaldevicefile) === undefined;
  const limit = ownLimit(values.limit);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving || draft === null) {
      return;
    }
    if (limitProblem(draft)) {
      setLimitError(true);
      limitRef.current?.focus();
      return;
    }
    save.reset();
    const key = getSmartGetDeviceSettingsQueryKey({
      devicefile: disk.devicefile,
    });
    save.mutate(
      { data: monitoringRequest(disk, saved, draft) },
      {
        onSuccess: (stored) => {
          queryClient.setQueryData(key, {
            ...stored,
            _used: saved?._used ?? false,
          });
          void queryClient.invalidateQueries({ queryKey: key });
          setDraft(null);
          setSavedNotice(true);
        },
      },
    );
  };

  const discard = () => {
    setDraft(null);
    setLimitError(false);
    save.reset();
  };

  const watchHint = (
    <>
      <span className="block">{t("disk.monitoring.watchHint")}</span>
      {locked ? (
        <span className="mt-1 block text-foreground">
          {t("disk.monitoring.hasTests", { count: Math.max(tests, 1) })}
        </span>
      ) : null}
      {notInCheck ? (
        <span className="mt-1 block">{t("disk.monitoring.notInCheck")}</span>
      ) : null}
    </>
  );

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={t("disk.monitoring.title")}
      className="flex max-w-[40rem] flex-col gap-4"
    >
      <LeaveGuard when={dirty} />
      {failure ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("disk.monitoring.saveFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      {globalOff ? (
        <InlineAlert tone="neutral" role="note">
          <p>{t("disk.monitoring.globalOff")}</p>
          <p>
            <Link to="/storage/smart/settings" className={routerLinkClass}>
              {t("disk.monitoring.settingsLink")}
            </Link>
          </p>
        </InlineAlert>
      ) : null}

      <CheckboxField
        label={t("disk.monitoring.watch")}
        hint={watchHint}
        checked={values.enable}
        // Unavailable but focusable, so its reason can be reached (style guide 5.3).
        readOnly={saving || locked}
        aria-disabled={locked ? true : undefined}
        onCheckedChange={(checked: boolean) => {
          if (!locked) {
            edit({ enable: checked });
          }
        }}
      />

      <Disclosure defaultOpen={values.limitMode === "own"}>
        <DisclosureTrigger>{t("disk.monitoring.tempShow")}</DisclosureTrigger>
        <DisclosurePanel>
          <RadioGroupField
            legend={
              <span className="sr-only">{t("disk.monitoring.tempShow")}</span>
            }
            value={values.limitMode}
            readOnly={saving}
            onValueChange={(mode) => {
              edit({ limitMode: mode === "own" ? "own" : "same" });
              setLimitError(false);
            }}
          >
            <RadioOption
              value="same"
              label={t("disk.monitoring.tempSame", {
                limit:
                  globalLimit > 0
                    ? format.celsius(globalLimit)
                    : t("disk.monitoring.tempNoLimit"),
              })}
            />
            <RadioOption value="own" label={t("disk.monitoring.tempOwn")}>
              {values.limitMode === "own" ? (
                <NumberField
                  label={t("disk.monitoring.tempLimit")}
                  unit="°C"
                  inputRef={limitRef}
                  value={values.limit}
                  readOnly={saving}
                  onValueChange={(limitText) => {
                    edit({ limit: limitText });
                    setLimitError(false);
                  }}
                  onBlur={() => setLimitError(limitProblem(values) !== null)}
                  hint={
                    limit === null
                      ? undefined
                      : t("disk.monitoring.tempHint", {
                          alert: format.celsius(limit + ALERT_MARGIN),
                        })
                  }
                  error={
                    limitError ? t("disk.monitoring.tempRange") : undefined
                  }
                />
              ) : null}
            </RadioOption>
          </RadioGroupField>
        </DisclosurePanel>
      </Disclosure>

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
            disabled={!dirty || saving}
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
