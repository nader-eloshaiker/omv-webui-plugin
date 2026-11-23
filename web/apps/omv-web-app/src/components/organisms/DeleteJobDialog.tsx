// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a copy job (phase 5 services design 8): a plain confirmation, since a job is configuration
// and no file is lost (Undo in the band brings it back before Apply). Rsync.delete is marked
// x-omv-dirty, so the band appears through the central wiring; the toast says when it takes effect.
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import {
  getRsyncGetListQueryKey,
  useRsyncDelete,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  ConfirmDialog,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import type { JobSides } from "../../services/jobModel.ts";
import { recordJobSaved } from "../../services/jobsSession.ts";
import { JobSideView } from "../molecules/JobDirection.tsx";

export interface DeleteTarget {
  uuid: string;
  name: string;
  sides: JobSides | null;
}

export function DeleteJobDialog({
  target,
  folders,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  folders: readonly SharedFolder[] | undefined;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const del = useRsyncDelete();
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          del.reset();
          onClose();
        }
      }}
      title={t("deleteJob.title", { job: isolateName(target?.name ?? "") })}
      description={
        target?.sides == null ? null : (
          <Trans
            i18nKey="deleteJob.body"
            components={{
              src: <JobSideView side={target.sides.from} folders={folders} />,
              dest: <JobSideView side={target.sides.to} folders={folders} />,
            }}
          />
        )
      }
      confirmLabel={t("deleteJob.confirm")}
      cancelLabel={t("deleteJob.cancel")}
      pending={del.isPending}
      error={
        del.error ? (
          <span className="flex flex-col gap-1">
            <span>{t("deleteJob.failed")}</span>
            {isRpcError(del.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {del.error.message}
              </ServerMessage>
            ) : null}
          </span>
        ) : undefined
      }
      onConfirm={() => {
        if (target === null || del.isPending) {
          return;
        }
        const { uuid, name } = target;
        del.mutate(
          { data: { uuid } },
          {
            onSuccess: () => {
              recordJobSaved(uuid);
              // The list and the job read again: the deleted job goes from the list now.
              void queryClient.invalidateQueries({
                queryKey: getRsyncGetListQueryKey().slice(0, 2),
              });
              toast.show({
                title: t("deleteJob.done", { job: isolateName(name) }),
              });
              onClose();
              onDeleted?.();
            },
          },
        );
      }}
    />
  );
}
