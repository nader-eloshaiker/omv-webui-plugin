// SPDX-License-Identifier: GPL-3.0-or-later
// "Found on the disks, not mounted" (phase 5 file-systems design 1.5, D6): file systems the NAS can see
// that are not set up, such as a disk from another computer or one created in a session that ended
// before it was mounted (R8). Each has a visible "Mount…". Shown only when there are any; a failed read
// says so here and leaves the main table alone. A narrow table stacks: the name on top, its type and
// disks as lines, then "Mount…".
import type {
  DetectedFilesystem,
  DiskDevice,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  PageSection,
  ServerMessage,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
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
  if (found === undefined && failed) {
    return (
      <PageSection heading={t("filesystems.found.title")}>
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
      </PageSection>
    );
  }
  if (found === undefined || found.length === 0) {
    return null;
  }
  return (
    <PageSection
      heading={t("filesystems.found.title")}
      lead={t("filesystems.found.intro")}
    >
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
              <TableCell narrow="title" className="@min-[40rem]:min-w-48">
                <FsNameView name={fsName(fs)} />
              </TableCell>
              <TableCell
                label={t("filesystems.col.type")}
                className="whitespace-nowrap"
              >
                <FsTypeView type={fs.type} />
              </TableCell>
              <TableCell label={t("filesystems.col.on")}>
                <FsOnDisks fs={fs} disks={disks} />
              </TableCell>
              {/* Stacked, the button is a line of its own under the facts. */}
              <TableCell className="text-end">
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
    </PageSection>
  );
}
