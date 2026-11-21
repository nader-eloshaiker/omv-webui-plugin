// SPDX-License-Identifier: GPL-3.0-or-later
// Disk health > Settings, the form (phase 5 disks design 5.2, 5.3): edit, Save (Smart.setSettings with
// all five fields), then Apply in the pending band, which the transport's x-omv-dirty signal brings
// up. A refetch never overwrites unsaved edits; while clean, the form follows the server.
import type { SmartSettings } from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetSettingsQueryKey,
  useSmartSetSettings,
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
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ALERT_MARGIN } from "../../disks/diskWords.ts";
import {
  fromSettingsDraft,
  hasProblem,
  intervalIsOdd,
  isPowerMode,
  POWER_MODES,
  settingsDirty,
  settingsProblems,
  toSettingsDraft,
  type SettingsProblems,
  type SmartSettingsDraft,
} from "../../disks/smartSettingsForm.ts";
import { useFormat } from "../../format/useFormat.ts";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";

const NO_PROBLEMS: SettingsProblems = {
  minutes: false,
  tempAt: false,
  tempDiffAt: false,
};

export function SmartSettingsForm({
  saved,
  pending,
}: {
  saved: SmartSettings;
  /** smartmontools has saved changes waiting to be applied. */
  pending: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const save = useSmartSetSettings();
  const [draft, setDraft] = useState<SmartSettingsDraft | null>(null);
  const [shown, setShown] = useState<SettingsProblems>(NO_PROBLEMS);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const alertRef = useRef<HTMLDivElement>(null);
  const noChangesId = useId();

  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) {
      setSavedNotice(false);
    }
  }

  const values = draft ?? toSettingsDraft(saved);
  const dirty = draft !== null && settingsDirty(saved, draft);
  const saving = save.isPending;
  const failure = save.error;

  useEffect(() => {
    if (failure) {
      alertRef.current?.focus();
    }
  }, [failure]);

  const edit = (change: Partial<SmartSettingsDraft>) => {
    setDraft({ ...values, ...change });
    setSavedNotice(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving || draft === null) {
      return;
    }
    const problems = settingsProblems(draft);
    setShown(problems);
    if (hasProblem(problems)) {
      return;
    }
    save.reset();
    save.mutate(
      { data: fromSettingsDraft(draft) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getSmartGetSettingsQueryKey(),
          });
          setDraft(null);
          setSavedNotice(true);
        },
      },
    );
  };

  const discard = () => {
    setDraft(null);
    setShown(NO_PROBLEMS);
    save.reset();
  };

  const check = (key: keyof SettingsProblems) =>
    setShown((s) => ({ ...s, [key]: settingsProblems(values)[key] }));

  const tempLimit = Number(values.tempAt.trim());
  const alert =
    Number.isInteger(tempLimit) && tempLimit > 0
      ? format.celsius(tempLimit + ALERT_MARGIN)
      : "";

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={t("smart.tab.settings")}
      className="flex max-w-[40rem] flex-col gap-5"
    >
      <LeaveGuard when={dirty} />
      {failure ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("smart.settings.saveFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <CheckboxField
          label={t("smart.settings.watch")}
          hint={t("smart.settings.watchHint")}
          checked={values.enable}
          readOnly={saving}
          onCheckedChange={(enable: boolean) => edit({ enable })}
        />
        {values.enable ? null : (
          <p className="ps-6 text-sm">{t("smart.settings.watchOffWarn")}</p>
        )}
      </div>

      <NumberField
        label={t("smart.settings.interval")}
        unit={t("smart.settings.minutes")}
        hint={
          intervalIsOdd(saved.interval) && draft === null
            ? `${t("smart.settings.intervalHint")} ${t("smart.settings.intervalOdd", { seconds: saved.interval })}`
            : t("smart.settings.intervalHint")
        }
        error={shown.minutes ? t("smart.settings.intervalRange") : undefined}
        value={values.minutes}
        readOnly={saving}
        onValueChange={(minutes) => {
          edit({ minutes });
          setShown((s) => ({ ...s, minutes: false }));
        }}
        onBlur={() => check("minutes")}
      />

      <RadioGroupField
        legend={t("smart.settings.asleep")}
        hint={t("smart.settings.asleepHint")}
        value={values.powermode}
        readOnly={saving}
        onValueChange={(mode) => {
          if (isPowerMode(mode)) {
            edit({ powermode: mode });
          }
        }}
      >
        {POWER_MODES.map((mode) => (
          <RadioOption
            key={mode}
            value={mode}
            label={t(`smart.settings.mode.${mode}`)}
          />
        ))}
      </RadioGroupField>

      <div className="flex flex-col gap-3">
        <CheckboxField
          label={t("smart.settings.tempWarn")}
          checked={values.tempWarn}
          readOnly={saving}
          onCheckedChange={(tempWarn: boolean) => {
            edit({ tempWarn });
            setShown((s) => ({ ...s, tempAt: false }));
          }}
        />
        {values.tempWarn ? (
          <NumberField
            className="ps-6"
            label={t("smart.settings.tempAt")}
            unit="°C"
            hint={t("smart.settings.tempHint", { alert })}
            error={shown.tempAt ? t("smart.settings.tempRange") : undefined}
            value={values.tempAt}
            readOnly={saving}
            onValueChange={(tempAt) => {
              edit({ tempAt });
              setShown((s) => ({ ...s, tempAt: false }));
            }}
            onBlur={() => check("tempAt")}
          />
        ) : null}
      </div>

      <Disclosure defaultOpen={saved.tempdiff > 0}>
        <DisclosureTrigger>{t("smart.settings.more")}</DisclosureTrigger>
        <DisclosurePanel>
          <div className="flex flex-col gap-3">
            <CheckboxField
              label={t("smart.settings.tempDiff")}
              checked={values.tempDiffOn}
              readOnly={saving}
              onCheckedChange={(tempDiffOn: boolean) => {
                edit({ tempDiffOn });
                setShown((s) => ({ ...s, tempDiffAt: false }));
              }}
            />
            {values.tempDiffOn ? (
              <NumberField
                className="ps-6"
                label={t("smart.settings.tempDiffAt")}
                unit="°C"
                hint={t("smart.settings.tempDiffHint")}
                error={
                  shown.tempDiffAt ? t("smart.settings.tempRange") : undefined
                }
                value={values.tempDiffAt}
                readOnly={saving}
                onValueChange={(tempDiffAt) => {
                  edit({ tempDiffAt });
                  setShown((s) => ({ ...s, tempDiffAt: false }));
                }}
                onBlur={() => check("tempDiffAt")}
              />
            ) : null}
          </div>
        </DisclosurePanel>
      </Disclosure>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
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
