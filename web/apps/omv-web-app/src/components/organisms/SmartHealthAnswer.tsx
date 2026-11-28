// SPDX-License-Identifier: GPL-3.0-or-later
// The Disk health Overview's answer, the first thing under its tabs: how the disks are. Before the
// session's check it says why the check waits for the reader (it wakes sleeping disks) and offers it.
// After it, one sentence: every disk OK (under the OK label), or how many need the reader, then each
// of those by name under its own state, with what it means and what to do. Every status label belongs
// to the disks it stands for, so a single problem is never labelled twice. The button keeps its place while it turns into "Checking…" and then
// "Check again", so focus stays on it. A check that ends while the page is open is announced.
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  PageSection,
  ServerMessage,
  StatusLabel,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";

const byName = (a: SmartDevice, b: SmartDevice) =>
  a.devicename.localeCompare(b.devicename, undefined, { numeric: true });

export function SmartHealthAnswer() {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const [openedAt] = useState(Date.now);
  const result = check.result;
  const disks = result?.list.data ?? [];
  const attention = disks
    .filter((d) => diskState(d.overallstatus).status !== "ok")
    .sort(byName);
  const sentence =
    attention.length === 0
      ? t("smart.answer.allOk", { count: disks.length })
      : t("smart.answer.attention", {
          count: attention.length,
          total: disks.length,
        });

  let announcement = "";
  if (check.checking) {
    announcement = t("diskCheck.checkingLine");
  } else if (result && result.readAt >= openedAt && !check.failed) {
    announcement = t("smart.answer.announce", { sentence });
  }

  const button = (
    <Button
      variant="neutral"
      size={result ? "sm" : "md"}
      loading={check.checking}
      onClick={check.checking ? undefined : check.start}
    >
      {check.checking
        ? t("diskCheck.checking")
        : result
          ? t("diskCheck.checkAgain")
          : check.failed
            ? t("common.tryAgain")
            : t("diskCheck.check")}
    </Button>
  );

  return (
    <PageSection aria-label={t("smart.answer.label")}>
      {check.failed ? (
        <InlineAlert tone="critical" title={t("diskCheck.failed")}>
          {isRpcError(check.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {check.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      {result === undefined ? (
        <div className="flex max-w-prose flex-col items-start gap-group">
          <p className="text-lg">{t("disks.health.intro")}</p>
          {button}
        </div>
      ) : (
        <>
          <div className="flex max-w-prose flex-col items-start gap-line">
            {disks.length > 0 && attention.length === 0 ? (
              <StatusLabel status="ok">{t("health.ok")}</StatusLabel>
            ) : null}
            <p className="text-lg">
              {disks.length === 0 ? t("smart.answer.none") : sentence}
            </p>
          </div>
          {attention.length === 0 ? null : (
            <ul className="flex max-w-prose flex-col gap-group">
              {attention.map((disk) => {
                const state = diskState(disk.overallstatus);
                return (
                  <li key={disk.devicename} className="flex flex-col gap-line">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <DiskLink
                        devicename={disk.devicename}
                        device={disk.canonicaldevicefile}
                      />
                      {disk.model.trim() === "" ? null : (
                        <span dir="auto" className="text-muted-foreground">
                          {disk.model}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-start gap-line">
                      <StatusLabel status={state.status}>
                        {t(`health.${state.status}`)}
                      </StatusLabel>
                      {state.reason === null ? null : (
                        <span>
                          <DiskReason overallstatus={disk.overallstatus} />
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("disks.health.checkedAt", {
                time: format.clock(result.readAt),
              })}
            </span>
            {button}
          </div>
        </>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </PageSection>
  );
}
