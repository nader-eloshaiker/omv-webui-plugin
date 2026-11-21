// SPDX-License-Identifier: GPL-3.0-or-later
// "Wipe this disk", last on a disk's page and apart from the settings (phase 5 disks design 3; owner,
// P1 to P9). The server checks only that the device exists (UX audit B14), so every refusal here is the
// interface's own, decided from the reads that do not wake a disk (diskUse.ts): the button stays
// unavailable, and focusable, with each blocker in words and what to do. When the safety check could
// not run, nothing can be wiped (fail closed). The button opens a dialog that checks again before it
// offers the typed confirmation, and checks once more before the wipe starts. While a wipe of this disk
// runs, or has ended and is not dismissed, the section shows it instead.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { Button } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { diskSession, forgetWipe } from "../../disks/diskSession.ts";
import type { SessionMarks } from "../../disks/diskUse.ts";
import { useDiskInventory } from "../../hooks/useDiskReads.ts";
import { useWipeDialog } from "../../hooks/useWipeDialog.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { WipeBlockers } from "../molecules/WipeBlockers.tsx";
import { WipeDialog } from "./WipeDialog.tsx";
import { WipePanel } from "./WipePanel.tsx";

export function WipeSection({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const headingId = useId();
  const blockersId = useId();
  const inventory = useDiskInventory();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [retrying, setRetrying] = useState(false);

  const record = session.wipes[disk.devicefile];
  const task =
    record === undefined
      ? undefined
      : tasks.find((each) => each.id === record.taskId);
  const marks: SessionMarks = {
    wiping: task?.state === "running",
    wipedAt: session.wipedAt[disk.devicefile],
  };
  const dialog = useWipeDialog(marks);

  const use = inventory.uses.get(disk.devicename);
  const loading = inventory.useState === "loading" || use === undefined;
  // While the inputs are still being read, nothing is known yet: the button waits, and the section
  // says it is checking, not that the check failed (the system and read-only refusals show at once).
  const blockers = (use?.blockers ?? []).filter(
    (b) => !(loading && b.kind === "unchecked"),
  );
  const blocked = loading || blockers.length > 0;

  const dismiss = () => {
    if (record !== undefined) {
      taskRegistry.dismiss(record.taskId);
      forgetWipe(disk.devicefile);
    }
  };
  // "Try again": read the four inputs again; the fresh replies land in the shared cache entries.
  const readAgain = () => {
    setRetrying(true);
    void dialog.recheck(disk, marks).finally(() => setRetrying(false));
  };
  const wipeAgain = () => {
    dismiss();
    dialog.open(disk);
  };

  return (
    <section
      aria-labelledby={headingId}
      data-slot="wipe-section"
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {t("wipe.title")}
      </h2>
      {record !== undefined && task !== undefined ? (
        <WipePanel
          record={record}
          headingRef={panelHeadingRef}
          onWipeAgain={wipeAgain}
          onDismiss={dismiss}
        />
      ) : (
        <>
          <p className="max-w-prose">{t("wipe.intro")}</p>
          <div className="flex flex-col items-start gap-3">
            <Button
              ref={openerRef}
              variant="neutral"
              disabled={blocked}
              focusableWhenDisabled
              aria-describedby={blockers.length > 0 ? blockersId : undefined}
              onClick={() => dialog.open(disk)}
            >
              {t("wipe.open")}
            </Button>
            {loading && blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("wipe.checking")}
              </p>
            ) : null}
            {blockers.length > 0 ? (
              <WipeBlockers
                id={blockersId}
                blockers={blockers}
                error={inventory.useError}
                onRetry={readAgain}
                retrying={retrying}
              />
            ) : null}
          </div>
        </>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <WipeDialog
        dialog={dialog}
        disk={disk}
        marks={marks}
        openerRef={openerRef}
        panelHeadingRef={panelHeadingRef}
        onStarted={(device) => setAnnouncement(t("wipe.started", { device }))}
      />
    </section>
  );
}

/**
 * The wipe panel of the disk last known as `/dev/<devicename>`, for a disk's page whose disk is no
 * longer connected (design 2.9): a running wipe, or one that ended and is not dismissed, stays.
 */
export function WipePanelForGoneDisk({ devicename }: { devicename: string }) {
  const { t } = useTranslation();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const device = `/dev/${devicename}`;
  const entry = Object.entries(session.wipes).find(
    ([, record]) =>
      record.device === device && tasks.some((t) => t.id === record.taskId),
  );
  if (entry === undefined) {
    return null;
  }
  const [devicefile, record] = entry;
  return (
    <section className="flex flex-col gap-3" aria-label={t("wipe.title")}>
      <WipePanel
        record={record}
        headingRef={headingRef}
        onDismiss={() => {
          taskRegistry.dismiss(record.taskId);
          forgetWipe(devicefile);
        }}
      />
    </section>
  );
}
