// SPDX-License-Identifier: GPL-3.0-or-later
// "Found on the disks, not mounted" (phase 5 file-systems design 1.5, D6): file systems the NAS can see
// that are not set up, such as a disk from another computer or one created in a session that ended
// before it was mounted (R8). Each has a visible "Mount…". Shown only when there are any; a failed read
// says so here and leaves the main table alone.
import type {
  DetectedFilesystem,
  DiskDevice,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  ServerMessage,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { fsName } from "../../filesystems/fsModel.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { FsNameView, FsTypeView } from "../atoms/FsNameView.tsx";
import { FsOnDisks } from "../molecules/FsOnDisks.tsx";

export function FoundFileSystems({
  found,
  failed,
  error,
  retrying,
  disks,
  onRetry,
  onMount,
}: {
  found: readonly DetectedFilesystem[] | undefined;
  failed: boolean;
  error: unknown;
  retrying: boolean;
  disks: readonly DiskDevice[] | undefined;
  onRetry: () => void;
  onMount: (fs: DetectedFilesystem) => void;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const headingId = useId();
  if (found === undefined && failed) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("filesystems.found.title")}
        </h2>
        <InlineAlert tone="critical" title={t("filesystems.found.failed")}>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
          <p className="mt-2">
            <Button
              variant="neutral"
              size="sm"
              loading={retrying}
              onClick={retrying ? undefined : onRetry}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      </section>
    );
  }
  if (found === undefined || found.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("filesystems.found.title")}
      </h2>
      <p className="max-w-prose">{t("filesystems.found.intro")}</p>
      <Table
        aria-label={t("filesystems.found.tableLabel")}
        frameLabel={t("filesystems.found.tableLabel")}
      >
        <TableHeader>
          <TableRow>
            <TableHead>{t("filesystems.col.name")}</TableHead>
            <TableHead>{t("filesystems.col.type")}</TableHead>
            <TableHead>{t("filesystems.col.on")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("filesystems.found.mount")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {found.map((fs) => (
            <TableRow key={`${fs.uuid}:${fs.devicefile}`}>
              <TableCell className="min-w-48 py-2">
                <FsNameView name={fsName(fs)} />
              </TableCell>
              <TableCell className="py-2 whitespace-nowrap">
                <FsTypeView type={fs.type} />
              </TableCell>
              <TableCell className="py-2">
                <FsOnDisks fs={fs} disks={disks} />
              </TableCell>
              <TableCell className="py-2 text-end">
                <Button
                  variant="neutral"
                  size="sm"
                  aria-label={t("filesystems.found.mountName", {
                    name: words.nameText(fs),
                  })}
                  onClick={() => onMount(fs)}
                >
                  {t("filesystems.found.mount")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
