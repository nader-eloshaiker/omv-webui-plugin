// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D's decisions, in one form (phase 5 disks design 7.3): which disks to watch (from the session's
// disk-health check, which the form offers to run first because it wakes the disks), the regular
// self-test, sleeping disks, the temperature warning, and how the owner is told. Nothing is saved
// here: Continue leads to the summary.
import type {
  EmailNotificationSettings,
  SmartDevice,
  SmartScheduleEntry,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  Identifier,
  InlineAlert,
  NumberField,
  RadioGroupField,
  RadioOption,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  ServerMessage,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import { ALERT_MARGIN } from "../../disks/diskWords.ts";
import {
  hourName,
  isTicked,
  parseLimit,
  testsOf,
  weekdayName,
  type DiskOffer,
  type SetUpDraft,
  type TestChoice,
} from "../../disks/setupPlan.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";
import { SetUpEmailLine } from "../molecules/SetUpEmailLine.tsx";

/** More independent options than this get Select all and Select none (7.3 A). */
const SELECT_ALL_FROM = 10;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const DAYS = Array.from({ length: 28 }, (_, d) => d + 1);

function Picker({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: readonly { value: number; label: string }[];
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const items = options.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <Select
        items={items}
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(Number(next));
          }
        }}
      >
        <SelectLabel>{label}</SelectLabel>
        <SelectTrigger />
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A disk's line in the list: device, model, size; the serial number under it. */
function diskLabel(disk: SmartDevice): string {
  const bytes = parseByteCount(disk.size);
  return [disk.model.trim(), bytes === null ? "" : formatBytes(bytes)]
    .filter((p) => p !== "")
    .join(", ");
}

export function SetUpDecisions({
  check,
  offer,
  schedule,
  email,
  emailFailed,
  draft,
  onDraftChange,
  onContinue,
}: {
  check: {
    readAt: number | undefined;
    checking: boolean;
    failed: boolean;
    error: unknown;
    onCheck: () => void;
  };
  /** The disks of the session's check; undefined before any check. */
  offer: DiskOffer | undefined;
  schedule: readonly SmartScheduleEntry[];
  email: EmailNotificationSettings | undefined;
  emailFailed: boolean;
  draft: SetUpDraft;
  onDraftChange: (draft: SetUpDraft) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const [tempError, setTempError] = useState(false);
  const tempRef = useRef<HTMLInputElement>(null);
  const waitId = useId();
  const unavailable = offer === undefined;
  const edit = (change: Partial<SetUpDraft>) =>
    onDraftChange({ ...draft, ...change });

  const weekdays = WEEKDAYS.map((w) => ({ value: w, label: weekdayName(w) }));
  const hours = HOURS.map((h) => ({ value: h, label: hourName(h) }));
  const days = DAYS.map((d) => ({ value: d, label: String(d) }));

  const chosen = offer?.offered.filter((d) => isTicked(draft, d)) ?? [];
  const covered = [...chosen, ...(offer?.watched ?? [])];
  const keeps = covered
    .map((disk) => ({ disk, count: testsOf(disk, schedule) }))
    .filter((k) => k.count > 0);

  const limit = parseLimit(draft.tempText);

  const submit = () => {
    if (unavailable) {
      return;
    }
    if (draft.temp && limit === null) {
      setTempError(true);
      tempRef.current?.focus();
      return;
    }
    onContinue();
  };

  const shortFields: ReactNode = (
    <div
      role="group"
      aria-label={t("smart.tests.type.S")}
      className="flex flex-wrap gap-3"
    >
      <Picker
        label={t("smart.setup.on")}
        value={draft.shortWeekday}
        options={weekdays}
        onChange={(v) => edit({ shortWeekday: v })}
        disabled={unavailable}
      />
      <Picker
        label={t("smart.setup.at")}
        value={draft.shortHour}
        options={hours}
        onChange={(v) => edit({ shortHour: v })}
        disabled={unavailable}
      />
    </div>
  );
  const longFields: ReactNode = (
    <div
      role="group"
      aria-label={t("smart.tests.type.L")}
      className="flex flex-wrap gap-3"
    >
      <Picker
        label={t("smart.setup.onDay")}
        value={draft.longDay}
        options={days}
        onChange={(v) => edit({ longDay: v })}
        disabled={unavailable}
      />
      <Picker
        label={t("smart.setup.at")}
        value={draft.longHour}
        options={hours}
        onChange={(v) => edit({ longHour: v })}
        disabled={unavailable}
      />
    </div>
  );

  return (
    <div className="flex max-w-[44rem] flex-col gap-6">
      {/* A. Which disks */}
      <div className="flex flex-col gap-3">
        {check.readAt === undefined ? (
          <>
            <p className="max-w-prose">{t("smart.setup.needCheck")}</p>
            {check.failed ? (
              <InlineAlert tone="critical" title={t("diskCheck.failed")}>
                {isRpcError(check.error) ? (
                  <ServerMessage label={t("app.serverMessage")}>
                    {check.error.message}
                  </ServerMessage>
                ) : null}
              </InlineAlert>
            ) : null}
            <div>
              <Button
                variant="neutral"
                loading={check.checking}
                onClick={check.checking ? undefined : check.onCheck}
              >
                {check.checking
                  ? t("diskCheck.checking")
                  : check.failed
                    ? t("common.tryAgain")
                    : t("diskCheck.check")}
              </Button>
            </div>
            <p role="status" className="text-sm empty:hidden">
              {check.checking ? t("diskCheck.checkingLine") : ""}
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm tabular-nums">
              {t("smart.setup.usingCheck", {
                time: format.clock(check.readAt),
              })}
            </p>
            <Button
              variant="neutral"
              size="sm"
              loading={check.checking}
              onClick={check.checking ? undefined : check.onCheck}
            >
              {check.checking
                ? t("diskCheck.checking")
                : t("diskCheck.checkAgain")}
            </Button>
          </div>
        )}

        {offer === undefined ? null : offer.offered.length === 0 ? (
          <p>
            {offer.watched.length === 0
              ? t("smart.setup.notInCheckNoDisks")
              : t("smart.setup.allWatched")}
          </p>
        ) : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-base font-semibold text-foreground">
              {t("smart.setup.disks")}
            </legend>
            {offer.offered.length >= SELECT_ALL_FROM ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={() =>
                    edit({
                      ticks: Object.fromEntries(
                        offer.offered.map((d) => [d.canonicaldevicefile, true]),
                      ),
                    })
                  }
                >
                  {t("smart.setup.selectAll")}
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={() =>
                    edit({
                      ticks: Object.fromEntries(
                        offer.offered.map((d) => [
                          d.canonicaldevicefile,
                          false,
                        ]),
                      ),
                    })
                  }
                >
                  {t("smart.setup.selectNone")}
                </Button>
              </div>
            ) : null}
            {offer.offered.map((disk) => {
              const state = diskState(disk.overallstatus);
              return (
                <CheckboxField
                  key={disk.canonicaldevicefile}
                  checked={isTicked(draft, disk)}
                  onCheckedChange={(checked: boolean) =>
                    edit({
                      ticks: {
                        ...draft.ticks,
                        [disk.canonicaldevicefile]: checked,
                      },
                    })
                  }
                  label={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Identifier>{disk.canonicaldevicefile}</Identifier>
                      <span dir="auto">{diskLabel(disk)}</span>
                      {state.status === "ok" ? null : (
                        <StatusPill status={state.status}>
                          {t(`health.${state.status}`)}
                        </StatusPill>
                      )}
                    </span>
                  }
                  hint={
                    <>
                      {disk.serialnumber.trim() === "" ? null : (
                        <span className="block text-xs">
                          {t("smart.setup.diskSerial", {
                            serial: disk.serialnumber,
                          })}
                        </span>
                      )}
                      {disk.overallstatus === "BAD_STATUS" ? (
                        <span className="block">
                          {t("smart.setup.badStatus")}
                        </span>
                      ) : state.reason === null ? null : (
                        <span className="block text-foreground">
                          <DiskReason overallstatus={disk.overallstatus} />
                        </span>
                      )}
                    </>
                  }
                />
              );
            })}
          </fieldset>
        )}
        {offer && offer.watched.length > 0 && offer.offered.length > 0 ? (
          <p className="text-sm">
            {t("smart.setup.alreadyWatched", {
              list: offer.watched.map((d) => d.canonicaldevicefile).join(", "),
            })}
          </p>
        ) : null}
        {offer && offer.notListed.length > 0 ? (
          <p className="text-sm">
            {t("smart.setup.notListed", { list: offer.notListed.join(", ") })}
          </p>
        ) : null}
      </div>

      {/* B. Regular self-test */}
      <div className="flex flex-col gap-2">
        <RadioGroupField
          legend={t("smart.setup.tests.label")}
          value={draft.tests}
          disabled={unavailable}
          onValueChange={(value) => edit({ tests: value as TestChoice })}
        >
          <RadioOption value="short" label={t("smart.setup.tests.short")}>
            {draft.tests === "short" ? shortFields : null}
          </RadioOption>
          <RadioOption
            value="long"
            label={t("smart.setup.tests.long")}
            hint={t("smart.setup.tests.longHint")}
          >
            {draft.tests === "long" ? longFields : null}
          </RadioOption>
          <RadioOption value="both" label={t("smart.setup.tests.both")}>
            {draft.tests === "both" ? (
              <div className="flex flex-col gap-3">
                {shortFields}
                {longFields}
              </div>
            ) : null}
          </RadioOption>
          <RadioOption value="none" label={t("smart.setup.tests.none")} />
        </RadioGroupField>
        {draft.tests === "none"
          ? null
          : keeps.map(({ disk, count }) => (
              <p key={disk.canonicaldevicefile} className="text-sm">
                {t("smart.setup.tests.keeps", {
                  device: disk.canonicaldevicefile,
                  count,
                })}
              </p>
            ))}
      </div>

      {/* C. Sleeping disks */}
      <CheckboxField
        label={t("smart.setup.sleep")}
        hint={t("smart.setup.sleepHint")}
        checked={draft.sleep}
        disabled={unavailable}
        onCheckedChange={(checked: boolean) => edit({ sleep: checked })}
      />

      {/* D. Temperature */}
      <div className="flex flex-col gap-3">
        <CheckboxField
          label={t("smart.setup.temp")}
          checked={draft.temp}
          disabled={unavailable}
          onCheckedChange={(checked: boolean) => {
            setTempError(false);
            edit({ temp: checked });
          }}
        />
        {draft.temp ? (
          <NumberField
            label={t("smart.setup.tempAt")}
            unit={t("smart.setup.celsius")}
            value={draft.tempText}
            inputRef={tempRef}
            disabled={unavailable}
            className="ps-6"
            onValueChange={(value) => {
              setTempError(false);
              edit({ tempText: value });
            }}
            onBlur={() => setTempError(parseLimit(draft.tempText) === null)}
            hint={
              limit === null
                ? undefined
                : t("smart.settings.tempHint", {
                    alert: format.celsius(limit + ALERT_MARGIN),
                  })
            }
            error={tempError ? t("smart.setup.tempRange") : undefined}
          />
        ) : null}
      </div>

      {/* E. How you are told */}
      <section
        aria-labelledby={`${waitId}-told`}
        className="flex flex-col gap-2"
      >
        <h3 id={`${waitId}-told`} className="text-base font-semibold">
          {t("smart.setup.told")}
        </h3>
        <SetUpEmailLine email={email} failed={emailFailed} laterNote />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={unavailable}
          focusableWhenDisabled
          aria-describedby={unavailable ? waitId : undefined}
          onClick={submit}
        >
          {t("smart.setup.continue")}
        </Button>
        {unavailable ? (
          <span id={waitId} className="text-sm text-muted-foreground">
            {t("smart.setup.checkFirst")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
