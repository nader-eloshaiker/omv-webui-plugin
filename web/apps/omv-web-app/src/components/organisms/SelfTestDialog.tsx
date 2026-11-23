// SPDX-License-Identifier: GPL-3.0-or-later
// Add or change a scheduled self-test (phase 5 disks design 6.4, D12): a dialog, not a route, since
// nothing about a test belongs in the address. The schedule is built from Every day, week or month, or
// Custom, and sent in the stock interface's exact forms (the contract's patterns are anchored). Save
// sends all nine fields; a new test takes OMV's new-object identifier. A long test every hour is
// refused (D14).
import type {
  DiskDevice,
  SmartScheduleEntry,
} from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetDeviceSettingsQueryKey,
  getSmartGetScheduleListQueryKey,
  useSmartSetScheduledTest,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  ScheduleField,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { NEW_OBJECT_UUID } from "../../disks/diskWords.ts";
import {
  blocksSave,
  draftProblems,
  fromScheduleValue,
  isTestType,
  MONTHS,
  NEW_DRAFT,
  scheduleOf,
  TEST_TYPES,
  toScheduleValue,
  toTestDraft,
  WEEKDAYS,
  type TestDraft,
} from "../../disks/schedule.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { isolate } from "../../format/isolate.ts";
import { ALL_TESTS } from "../../hooks/useDiskReads.ts";
import { hourText, monthText, weekdayText } from "../../hooks/useSmartWords.ts";
import { SELF_TEST_FREQUENCIES } from "../../services/jobSchedule.ts";
import {
  SelfTestSelect,
  type SelfTestOption,
} from "../molecules/SelfTestSelect.tsx";

/** What the dialog is for: a new test (on a chosen disk, if any), or a stored one. */
export type SelfTestDialogTarget =
  | { mode: "add"; devicefile?: string }
  | {
      mode: "edit";
      entry: SmartScheduleEntry;
      /** The disk's stable device file, or for a disk not connected the stored one. */
      devicefile: string;
      connected: boolean;
    };

export interface SelfTestDiskChoice {
  disk: DiskDevice;
  /** False when the disk is not watched: listed, but unavailable (6.4, field 1). */
  watched: boolean;
}

export function SelfTestDialog({
  target,
  disks,
  onClose,
  onSaved,
}: {
  target: SelfTestDialogTarget | null;
  disks: readonly SelfTestDiskChoice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {target === null ? null : (
        <DialogContent className="w-[min(36rem,calc(100vw-2rem))]">
          <DialogForm
            key={target.mode === "edit" ? target.entry.uuid : "add"}
            target={target}
            disks={disks}
            onClose={onClose}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DialogForm({
  target,
  disks,
  onClose,
  onSaved,
}: {
  target: SelfTestDialogTarget;
  disks: readonly SelfTestDiskChoice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useSmartSetScheduledTest();
  const [draft, setDraft] = useState<TestDraft>(() =>
    target.mode === "edit" ? toTestDraft(target.entry) : NEW_DRAFT,
  );
  const firstWatched = disks.find((d) => d.watched)?.disk.devicefile ?? "";
  const [devicefile, setDevicefile] = useState(() =>
    target.mode === "edit"
      ? target.devicefile
      : (target.devicefile ?? firstWatched),
  );
  const [tried, setTried] = useState(false);
  const problems = draftProblems(draft);
  const edit = (change: Partial<TestDraft>) =>
    setDraft({ ...draft, ...change });

  const diskOptions: SelfTestOption[] = disks.map(({ disk, watched }) => {
    const size = parseByteCount(disk.size);
    const label = t("smart.tests.dialog.diskOption", {
      device: disk.canonicaldevicefile,
      model: isolate(disk.model.trim() || t("disks.noModel")),
      size: size === null ? "" : formatBytes(size),
    });
    return {
      value: disk.devicefile,
      label: watched
        ? label
        : `${label} (${t("smart.tests.dialog.diskNotWatched")})`,
      disabled: !watched,
    };
  });
  if (target.mode === "edit" && !target.connected) {
    diskOptions.unshift({
      value: target.devicefile,
      label: t("smart.tests.dialog.diskNotConnected", {
        device: target.devicefile,
      }),
    });
  }
  const anyUnwatched = disks.some((d) => !d.watched);
  const noDisk = devicefile === "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (save.isPending || blocksSave(problems) || noDisk) {
      return;
    }
    save.reset();
    save.mutate(
      {
        data: {
          uuid: target.mode === "edit" ? target.entry.uuid : NEW_OBJECT_UUID,
          enable: draft.enable,
          devicefile,
          comment: draft.comment,
          type: draft.type,
          ...scheduleOf(draft),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getSmartGetScheduleListQueryKey(ALL_TESTS),
          });
          void queryClient.invalidateQueries({
            queryKey: getSmartGetDeviceSettingsQueryKey({ devicefile }),
          });
          onSaved();
        },
      },
    );
  };

  const saving = save.isPending;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {target.mode === "add"
            ? t("smart.tests.dialog.addTitle")
            : t("smart.tests.dialog.editTitle")}
        </DialogTitle>
      </DialogHeader>

      <SelfTestSelect
        label={t("smart.tests.dialog.disk")}
        value={devicefile}
        options={diskOptions}
        onValueChange={setDevicefile}
        disabled={saving}
        hint={
          anyUnwatched ? t("smart.tests.dialog.diskNotWatchedHint") : undefined
        }
      />

      <SelfTestSelect
        label={t("smart.tests.dialog.test")}
        value={draft.type}
        options={TEST_TYPES.map((type) => ({
          value: type,
          label: t(`smart.tests.type.${type}`),
          description: t(`smart.tests.typeHint.${type}`),
        }))}
        onValueChange={(type) => {
          if (isTestType(type)) {
            edit({ type });
          }
        }}
        disabled={saving}
      />

      <ScheduleField
        labels={{
          legend: t("smart.tests.dialog.when"),
          manual: "",
          schedule: "",
          frequency: t("smart.tests.dialog.often"),
          frequencies: {
            hourly: t("smart.tests.dialog.everyHour"),
            daily: t("smart.tests.dialog.daily"),
            weekly: t("smart.tests.dialog.weekly"),
            monthly: t("smart.tests.dialog.monthly"),
            custom: t("smart.tests.dialog.custom"),
          },
          at: t("smart.tests.dialog.at"),
          hour: t("smart.tests.dialog.hour"),
          minute: t("smart.tests.dialog.hour"),
          weekday: t("smart.tests.dialog.on"),
          day: t("smart.tests.dialog.onDay"),
          dayNote: t("smart.tests.dialog.dayOver28"),
          minutesPast: t("smart.tests.dialog.at"),
          custom: {
            minute: t("smart.tests.dialog.hour"),
            hour: t("smart.tests.dialog.hour"),
            day: t("smart.tests.dialog.dayOfMonth"),
            month: t("smart.tests.dialog.month"),
            weekday: t("smart.tests.dialog.weekday"),
          },
          every: {
            minute: t("smart.tests.dialog.everyHour"),
            hour: t("smart.tests.dialog.everyHour"),
            day: t("smart.tests.dialog.everyDay"),
            month: t("smart.tests.dialog.everyMonth"),
            weekday: t("smart.tests.dialog.everyWeekday"),
          },
          customNote: t("smart.tests.dialog.customHint"),
        }}
        weekdayNames={WEEKDAYS.map((w) => weekdayText(Number(w)))}
        monthNames={MONTHS.map((m) => monthText(Number(m)))}
        value={toScheduleValue(draft)}
        onValueChange={(value) => setDraft(fromScheduleValue(value, draft))}
        precision="hour"
        frequencies={SELF_TEST_FREQUENCIES}
        offerManual={false}
        disabled={saving}
        formatNumber={(n, part) => (part === "hour" ? hourText(n) : String(n))}
        errors={{
          custom: problems.longHourly
            ? t("smart.tests.dialog.longHourly")
            : problems.oddValue !== null
              ? t("smart.tests.dialog.oddValue", { value: problems.oddValue })
              : undefined,
        }}
      />
      {problems.longDaily ? (
        <p className="text-sm text-muted-foreground">
          {t("smart.tests.dialog.longDaily")}
        </p>
      ) : null}

      <CheckboxField
        label={t("smart.tests.dialog.enable")}
        hint={t("smart.tests.dialog.enableHint")}
        checked={draft.enable}
        readOnly={saving}
        onCheckedChange={(enable: boolean) => edit({ enable })}
      />

      <Field invalid={problems.noteTooLong ? true : undefined}>
        <FieldLabel>{t("smart.tests.dialog.note")}</FieldLabel>
        <FieldControl
          dir="auto"
          autoComplete="off"
          readOnly={saving}
          value={draft.comment}
          onValueChange={(comment) => edit({ comment })}
        />
        <FieldHint>{t("smart.tests.dialog.noteHint")}</FieldHint>
        {problems.noteTooLong ? (
          <FieldError>{t("smart.tests.dialog.noteTooLong")}</FieldError>
        ) : null}
      </Field>

      {save.error ? (
        <InlineAlert tone="critical" title={t("smart.tests.saveFailed")}>
          {isRpcError(save.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {save.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      {tried && noDisk ? (
        <p role="alert" className="text-sm text-critical-label">
          {t("smart.tests.dialog.diskNotWatchedHint")}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="neutral" onClick={onClose}>
          {t("smart.tests.dialog.cancel")}
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={blocksSave(problems) || noDisk}
          focusableWhenDisabled
        >
          {saving ? t("common.saving") : t("smart.tests.dialog.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
