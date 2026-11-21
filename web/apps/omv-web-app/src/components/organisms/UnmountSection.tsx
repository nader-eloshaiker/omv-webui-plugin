// SPDX-License-Identifier: GPL-3.0-or-later
// The last section of a file system's page, apart from its settings (phase 5 file-systems design 2.2
// item 9, 5.1): "Unmount this file system", "Remove this file system from the NAS" for a missing one,
// or, for a mount that is only pending, the sentence that says to undo it in the band (D16). The
// button is unavailable, and focusable, with each blocker in words, while anything uses the file system
// (the interface's own safeguard: the server does not check, UX audit J9). Once confirmed, the step
// list takes the section's place.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MountEntry,
} from "@omv-webui/react-api-omv/generated";
import { Button } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { actionOf, fsActions, isBusy } from "../../filesystems/fsActions.ts";
import {
  unmountBlockers,
  type EndSection,
  type UsedBy,
} from "../../filesystems/fsModel.ts";
import { useUnmountDialog } from "../../hooks/useUnmountDialog.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { UnmountBlockers } from "./UnmountBlockers.tsx";
import { UnmountDialog } from "./UnmountDialog.tsx";
import { UnmountPanel } from "./UnmountPanel.tsx";

export function UnmountSection({
  fs,
  section,
  name,
  address,
  used,
  entry,
  disk,
}: {
  fs: ConfiguredFilesystem;
  section: Exclude<EndSection, null>;
  name: string;
  address: string;
  used: UsedBy;
  entry: MountEntry | false | undefined;
  /** The disk it is on, for the confirmation. */
  disk: DiskDevice | undefined;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const blockersId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  useMemoryStore(fsActions);
  const kind = section === "remove" ? "remove" : "unmount";
  const dialog = useUnmountDialog(address, kind, entry);
  const action = actionOf(address);
  const running = action !== undefined && action.kind !== "grow";
  const blockers = unmountBlockers(fs, used, isBusy(action), kind);
  const remove = kind === "remove";

  return (
    <section
      aria-labelledby={headingId}
      data-slot="unmount-section"
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {remove ? t("fsRemove.title") : t("fsUnmount.title")}
      </h2>
      {running ? (
        <div ref={panelRef} tabIndex={-1} className="outline-hidden">
          <UnmountPanel address={address} onTryAgain={() => dialog.open()} />
        </div>
      ) : section === "pendingOnly" ? (
        <p className="max-w-prose">{t("fsUnmount.pendingOnly")}</p>
      ) : (
        <>
          <p className="max-w-prose">
            {remove ? t("fsRemove.intro") : t("fsUnmount.intro")}
          </p>
          <div className="flex flex-col items-start gap-3">
            <Button
              ref={openerRef}
              variant="neutral"
              disabled={blockers.length > 0}
              focusableWhenDisabled
              aria-describedby={blockers.length > 0 ? blockersId : undefined}
              onClick={() => dialog.open()}
            >
              {remove ? t("fsRemove.open") : t("fsUnmount.open")}
            </Button>
            {blockers.length > 0 ? (
              <UnmountBlockers id={blockersId} blockers={blockers} />
            ) : null}
          </div>
        </>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <UnmountDialog
        dialog={dialog}
        kind={kind}
        address={address}
        name={name}
        disk={
          disk === undefined
            ? fs.parentdevicefile
            : [disk.canonicaldevicefile, disk.model.trim()]
                .filter((part) => part !== "")
                .join(", ")
        }
        openerRef={openerRef}
        panelRef={panelRef}
        onStarted={() =>
          setAnnouncement(
            remove
              ? t("fsRemove.started", { name })
              : t("fsUnmount.started", { name }),
          )
        }
      />
    </section>
  );
}
