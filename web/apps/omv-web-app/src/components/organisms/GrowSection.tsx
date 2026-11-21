// SPDX-License-Identifier: GPL-3.0-or-later
// "Grow this file system" (phase 5 file-systems design 4; owner, P5): it makes the file system fill the
// device it is on. It cannot be undone but loses nothing, so its confirmation is destructive in form,
// without typing (UI-8 keeps typing for data loss). Unavailable, focusable, with the reason beside it,
// when it is not mounted, read-only, or BTRFS on several disks (D12). "Grow file system" reads the list
// again first; the grow then runs in the session's actions (fsActions.ts), so the result is still shown
// after the reader leaves and comes back. The size is compared with the one before.
import type {
  ConfiguredFilesystem,
  DiskDevice,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  Identifier,
  InlineAlert,
  JobFailure,
  JobResult,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  actionOf,
  dismissAction,
  fsActions,
  isBusy,
  startGrow,
} from "../../filesystems/fsActions.ts";
import { growBlockers } from "../../filesystems/fsModel.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FsTypeView } from "../atoms/FsNameView.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { FsOnDisks } from "../molecules/FsOnDisks.tsx";

export function GrowSection({
  fs,
  name,
  address,
  disks,
  onRefresh,
}: {
  fs: ConfiguredFilesystem;
  name: string;
  address: string;
  disks: readonly DiskDevice[] | undefined;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const api = useFsApi();
  const headingId = useId();
  const reasonId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  useMemoryStore(fsActions);
  const action = actionOf(address);
  const grow = action?.kind === "grow" ? action : undefined;
  const busy = isBusy(action);
  const blockers = growBlockers(fs, busy);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [changed, setChanged] = useState(false);

  const openDialog = () => {
    if (blockers.length > 0) {
      return;
    }
    setChanged(false);
    setOpen(true);
  };

  const confirm = async () => {
    if (checking || changed) {
      return;
    }
    setChecking(true);
    let fresh: ConfiguredFilesystem | undefined;
    try {
      const rows = await api.configured();
      fresh = rows.find(
        (r) => r.uuid !== "" && r.uuid.toLowerCase() === fs.uuid.toLowerCase(),
      );
    } catch {
      fresh = undefined;
    }
    setChecking(false);
    if (
      fresh === undefined ||
      fresh.status !== 1 ||
      !fresh.mounted ||
      growBlockers(fresh, false).length > 0
    ) {
      setChanged(true);
      return;
    }
    setOpen(false);
    startGrow(api, fresh, name, address);
  };

  const size = parseByteCount(fs.size);
  const phase = grow?.phase;
  let result = null;
  if (phase?.kind === "bigger") {
    result = (
      <JobResult
        result={{
          status: "succeeded",
          statusLabel: t("addStorage.state.succeeded"),
          message: (
            <>
              <span className="block font-semibold">
                {t("fsGrow.doneTitle", { name: grow?.name ?? name })}
              </span>
              <span className="block">
                {t("fsGrow.doneBody", {
                  size: formatBytes(phase.size),
                  before: formatBytes(phase.before),
                })}
              </span>
            </>
          ),
        }}
        dismissLabel={t("fsGrow.dismiss")}
        onDismiss={() => dismissAction(address)}
      />
    );
  } else if (phase?.kind === "same") {
    result = (
      <JobResult
        result={{
          status: "succeeded",
          statusLabel: t("addStorage.state.succeeded"),
          message: t("fsGrow.sameTitle", { name: grow?.name ?? name }),
        }}
        dismissLabel={t("fsGrow.dismiss")}
        onDismiss={() => dismissAction(address)}
      />
    );
  } else if (phase?.kind === "failed") {
    result = (
      <JobFailure
        title={t("fsGrow.failedTitle", { name: grow?.name ?? name })}
        message={t("fsGrow.failedBody")}
        serverMessage={
          isRpcError(phase.error)
            ? { label: t("app.serverMessage"), text: phase.error.message }
            : undefined
        }
        retryLabel={t("fsGrow.again")}
        onRetry={() => {
          dismissAction(address);
          openDialog();
        }}
        undo={{
          label: t("fsGrow.dismiss"),
          onUndo: () => dismissAction(address),
        }}
      />
    );
  } else if (phase?.kind === "unknown") {
    result = (
      <InlineAlert tone="neutral" title={t("fsGrow.unknown")}>
        <p className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              dismissAction(address);
              onRefresh();
            }}
          >
            {t("filesystem.refresh")}
          </Button>
        </p>
      </InlineAlert>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("fsGrow.title")}
      </h2>
      <p className="max-w-prose">{t("fsGrow.intro")}</p>
      {phase?.kind === "running" ? (
        <p role="status" className="flex flex-wrap items-center gap-2">
          <StatusPill status="running">{t("tasks.running")}</StatusPill>
          <span>{t("fsGrow.running", { name: grow?.name ?? name })}</span>
        </p>
      ) : null}
      <div className="flex flex-col items-start gap-2">
        <Button
          ref={openerRef}
          variant="neutral"
          loading={phase?.kind === "running"}
          disabled={blockers.length > 0}
          focusableWhenDisabled
          aria-describedby={blockers.length > 0 ? reasonId : undefined}
          onClick={openDialog}
        >
          {t("fsGrow.open")}
        </Button>
        {blockers.length > 0 ? (
          <ul id={reasonId} className="flex flex-col gap-1 text-sm">
            {blockers.map((b) => (
              <li key={b}>{t(`fsGrow.blocked.${b}`)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {result}
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !checking) {
            setOpen(false);
          }
        }}
        variant="destructive"
        title={t("fsGrow.dialogTitle", { name })}
        description={
          <Trans
            i18nKey="fsGrow.consequence"
            components={{
              device: <IdentifierText value={fs.canonicaldevicefile} />,
            }}
          />
        }
        cancelLabel={changed ? t("fsGrow.close") : t("fsGrow.cancel")}
        confirmLabel={
          checking ? t("fsGrow.checkingAgain") : t("fsGrow.confirm")
        }
        pending={checking}
        confirmDisabled={changed}
        error={changed ? t("fsGrow.changed") : undefined}
        onConfirm={() => void confirm()}
      >
        <ul className="flex flex-col gap-0.5">
          <li>
            <FsTypeView type={fs.type} />,{" "}
            <Identifier>{fs.canonicaldevicefile}</Identifier>
          </li>
          <li>
            <FsOnDisks fs={fs} disks={disks} />
          </li>
          {size === null ? null : (
            <li className="tabular-nums">
              {t("fsGrow.sizeNow", { size: formatBytes(size) })}
            </li>
          )}
        </ul>
        <p>{t("fsGrow.safe")}</p>
      </ConfirmDialog>
    </section>
  );
}
