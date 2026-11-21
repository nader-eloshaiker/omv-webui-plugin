// SPDX-License-Identifier: GPL-3.0-or-later
// "Technical details" on a file system's page (phase 5 file-systems design 2.5, D14): the file
// system's own report, read only when the reader presses "Show technical details", because reading it
// reads the disk and wakes it. The read is kept for the session and never refetched by itself
// (ON_REQUEST). A long report shows its first 500 lines, with the rest on request; Copy takes all of
// it. The report is server text, shown as text and untranslated (UI-2).
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  ServerMessage,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { taskLines } from "../../filesystems/terminal.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useFsDetails } from "../../hooks/useFsReads.ts";

/** How many lines of a long report are shown before "Show all lines". */
export const DETAILS_LIMIT = 500;

export function FsDetails({
  fs,
  name,
}: {
  fs: ConfiguredFilesystem;
  name: string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const headingId = useId();
  const details = useFsDetails(fs.canonicaldevicefile);
  const [shown, setShown] = useState(details.data !== undefined);
  const reading = details.isFetching;

  const show = () => {
    if (reading) {
      return;
    }
    setShown(true);
    if (details.data === undefined) {
      void details.refetch();
    }
  };

  const open = shown && details.data !== undefined;
  const failed = shown && details.isError && !reading;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("filesystem.details.title")}
      </h2>
      <p className="max-w-prose">{t("filesystem.details.intro")}</p>
      {open ? (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("filesystem.details.readAt", {
              time: format.clock(details.dataUpdatedAt),
            })}
          </p>
          <TaskLog
            lines={taskLines(details.data)}
            label={t("filesystem.details.label", { name })}
            copyLabel={t("filesystem.details.copy")}
            copiedLabel={t("filesystem.details.copied")}
            selectedLabel={t("filesystem.details.selected")}
            size="page"
            wrap={false}
            follow={false}
            limit={{
              lines: DETAILS_LIMIT,
              partialLabel: (shownLines, total) =>
                t("filesystem.details.partial", {
                  shown: format.count(shownLines),
                  count: format.count(total),
                }),
              showAllLabel: t("filesystem.details.showAllLines"),
            }}
          />
          <div>
            <Button variant="neutral" onClick={() => setShown(false)}>
              {t("filesystem.details.hide")}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant="neutral"
            loading={reading}
            onClick={reading ? undefined : show}
          >
            {reading
              ? t("filesystem.details.reading")
              : t("filesystem.details.show")}
          </Button>
        </div>
      )}
      {failed ? (
        <InlineAlert
          tone="critical"
          title={t("filesystem.details.failed")}
          role="alert"
        >
          {isRpcError(details.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {details.error.message}
            </ServerMessage>
          ) : null}
          <p className="mt-2">
            <Button
              variant="neutral"
              size="sm"
              onClick={() => void details.refetch()}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      ) : null}
    </section>
  );
}
