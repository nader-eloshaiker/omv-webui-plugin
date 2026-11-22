// SPDX-License-Identifier: GPL-3.0-or-later
// ZFS's own report, as text on the terminal pair (phase 5 ZFS design 2.7, 4.3): for a pool, the report
// already read for its state, shown on request; for a file system, read only on the reader's press,
// because it reads every property from the pool, which may wake its disks. The report can name damaged
// files and serial numbers: it stays in the session's memory and is never put in a title or a toast.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  ServerMessage,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportLines } from "../../zfs/zfsChoices.ts";

export function ZfsDetails({
  label,
  intro,
  text,
  failed,
  error,
  retrying,
  onRetry,
  onOpen,
  note,
}: {
  /** The log's accessible name: "ZFS's report on pool tank". */
  label: string;
  intro: string;
  text: string | null;
  failed: boolean;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  /** Called when the reader opens it: a file system's report is read only then. */
  onOpen?: () => void;
  /** Said beside the button before it is pressed ("This reads … may wake its disks."). */
  note?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="zfs-details" className="flex flex-col gap-2">
      <h2 id="zfs-details" className="text-lg font-semibold">
        {t("zfsPool.details.title")}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">{intro}</p>
      {note !== undefined && !open ? (
        <p className="max-w-prose text-sm">{note}</p>
      ) : null}
      <Disclosure
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            onOpen?.();
          }
        }}
      >
        <DisclosureTrigger>
          {open ? t("zfsPool.details.hide") : t("zfsPool.details.show")}
        </DisclosureTrigger>
        <DisclosurePanel>
          {failed ? (
            <InlineAlert tone="critical" title={t("zfsPool.details.failed")}>
              {isRpcError(error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.message}
                </ServerMessage>
              ) : null}
              <p>
                <Button
                  variant="neutral"
                  size="sm"
                  loading={retrying}
                  onClick={onRetry}
                >
                  {t("common.tryAgain")}
                </Button>
              </p>
            </InlineAlert>
          ) : text === null ? (
            <p role="status" aria-busy="true" className="text-muted-foreground">
              {t("app.loading")}
            </p>
          ) : (
            <TaskLog
              lines={reportLines(text)}
              label={label}
              copyLabel={t("zfsPool.details.copy")}
              copiedLabel={t("tasks.copied")}
              selectedLabel={t("tasks.selected")}
              size="page"
              wrap={false}
            />
          )}
        </DisclosurePanel>
      </Disclosure>
    </section>
  );
}
