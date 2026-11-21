// SPDX-License-Identifier: GPL-3.0-or-later
// The wipe's dialog (phase 5 disks design 3.2, 3.3; owner, P2, P4, P7): it opens at once and checks
// what is on the disk again, then shows a refusal, "This disk changed", "no longer connected", or the
// confirmation. The confirmation names the disk exactly, says what is lost, and is confirmed only by
// typing the device name; "Wipe disk" checks everything once more, serial number included, before the
// wipe starts, with the fresh row's stable device file. It has ConfirmDialog's destructive semantics,
// which ConfirmDialog itself cannot carry through these states: an alert dialog, the warning shape,
// the red button only on the act, focus starting on Cancel, no form (Enter never confirms), Escape and
// Cancel close it and the scrim does not.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { useDiskMgmtWipe } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  RadioGroupField,
  RadioOption,
  ServerMessage,
  TypeToConfirmField,
  typedMatches,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { SessionMarks } from "../../disks/diskUse.ts";
import { phaseAfterCheck } from "../../disks/wipe.ts";
import { startWipe } from "../../disks/wipeTask.ts";
import { formatBytes } from "../../format/format.ts";
import {
  useDiskSizeText,
  type useWipeDialog,
} from "../../hooks/useWipeDialog.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { WipeBlockers, WipeFsName } from "../molecules/WipeBlockers.tsx";

type DialogApi = ReturnType<typeof useWipeDialog>;

export function WipeDialog({
  dialog,
  disk,
  marks,
  openerRef,
  panelHeadingRef,
  onStarted,
}: {
  dialog: DialogApi;
  /** The disk the page shows: what the check compares the fresh reply with. */
  disk: DiskDevice;
  marks: SessionMarks;
  /** Where focus returns when the dialog closes without a wipe. */
  openerRef: RefObject<HTMLElement | null>;
  /** Where focus goes once the wipe has started: the running panel's heading. */
  panelHeadingRef: RefObject<HTMLElement | null>;
  onStarted: (device: string) => void;
}) {
  const { t } = useTranslation();
  const wipe = useDiskMgmtWipe();
  const sizeText = useDiskSizeText();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const [typed, setTyped] = useState("");
  const [method, setMethod] = useState<"quick" | "secure">("quick");
  const startedRef = useRef(false);
  const { control, setControl } = dialog;
  const { phase } = control;

  // Reset on the opening edge, during render, so the first frame is already empty.
  const [wasOpen, setWasOpen] = useState(control.open);
  if (control.open !== wasOpen) {
    setWasOpen(control.open);
    if (control.open) {
      setTyped("");
      setMethod("quick");
      startedRef.current = false;
    }
  }

  const device = disk.canonicaldevicefile;
  const matches = typedMatches(typed, device);

  const confirm = async () => {
    if (phase.phase !== "confirm" || phase.rechecking || !matches) {
      return;
    }
    const mine = ++dialog.runRef.current;
    const secure = method === "secure";
    setControl({
      open: true,
      phase: { ...phase, rechecking: true, startError: undefined },
    });
    const outcome = await dialog.recheck(phase.disk, marks);
    if (dialog.runRef.current !== mine) {
      return;
    }
    const next = phaseAfterCheck(outcome);
    if (next.phase !== "confirm") {
      // A blocker or a change appeared: nothing is wiped.
      setControl({ open: true, phase: next });
      return;
    }
    const fresh = next.disk;
    setControl({ open: true, phase: { ...next, rechecking: true } });
    try {
      await startWipe({
        devicefile: fresh.devicefile,
        device: fresh.canonicaldevicefile,
        serial: fresh.serialnumber,
        secure,
        label: t("wipe.taskLabel", { device: fresh.canonicaldevicefile }),
        begin: () =>
          wipe.mutateAsync({
            data: { devicefile: fresh.devicefile, secure },
          }),
      });
    } catch (error) {
      if (dialog.runRef.current === mine) {
        setControl({ open: true, phase: { ...next, startError: error } });
      }
      return;
    }
    if (dialog.runRef.current !== mine) {
      return;
    }
    startedRef.current = true;
    onStarted(fresh.canonicaldevicefile);
    dialog.close();
  };

  const confirming = phase.phase === "confirm";
  const checking = phase.phase === "checking";

  let title;
  let description;
  let body = null;
  switch (phase.phase) {
    case "checking":
      title = (
        <Trans
          i18nKey="wipe.dialogTitle"
          components={{ device: <IdentifierText value={device} /> }}
        />
      );
      description = t("wipe.checking");
      break;
    case "refused":
      title = t("wipe.refusedTitle");
      description = (
        <WipeBlockers blockers={phase.blockers} error={phase.error} />
      );
      break;
    case "changed":
      title = t("wipe.changedTitle");
      description = t("wipe.changedBody", { device: phase.device });
      break;
    case "gone":
      title = t("wipe.refusedTitle");
      description = t("wipe.goneBody");
      break;
    case "confirm": {
      const shown = phase.disk;
      title = (
        <Trans
          i18nKey="wipe.dialogTitle"
          components={{
            device: <IdentifierText value={shown.canonicaldevicefile} />,
          }}
        />
      );
      description = t("wipe.consequence");
      const model = shown.model.trim();
      const size = sizeText(shown.size);
      body = (
        <div className="flex flex-col gap-4">
          <ul data-slot="wipe-identity" className="flex flex-col gap-0.5">
            {model === "" ? null : (
              <li dir="auto" className="font-medium [overflow-wrap:anywhere]">
                {model}
              </li>
            )}
            {shown.serialnumber === "" ? null : (
              <li>
                <Trans
                  i18nKey="wipe.serial"
                  components={{
                    serial: <IdentifierText value={shown.serialnumber} />,
                  }}
                />
              </li>
            )}
            {size === "" ? null : <li className="tabular-nums">{size}</li>}
          </ul>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">{t("wipe.holdsTitle")}</h3>
            <ul className="flex list-disc flex-col gap-1 ps-5">
              {phase.unused.map((fs) => (
                <li key={fs.device}>
                  {fs.size === null ? (
                    <FsHolds fs={fs} withSize={null} />
                  ) : (
                    <FsHolds fs={fs} withSize={formatBytes(fs.size)} />
                  )}
                </li>
              ))}
              {phase.unused.length === 0 ? (
                <li>{t("wipe.holds.none")}</li>
              ) : null}
              {phase.untraceable ? (
                <li>{t("wipe.holds.untraceable")}</li>
              ) : null}
              <li>{t("wipe.holds.settingsKept")}</li>
            </ul>
          </section>
          <RadioGroupField
            legend={t("wipe.method")}
            value={method}
            onValueChange={(value) =>
              setMethod(value === "secure" ? "secure" : "quick")
            }
            readOnly={phase.rechecking}
          >
            <RadioOption
              value="quick"
              label={t("wipe.quick")}
              hint={t("wipe.quickHint")}
            />
            <RadioOption
              value="secure"
              label={t("wipe.secure")}
              hint={t("wipe.secureHint")}
            >
              {method === "secure" ? (
                <p className="text-sm">{t("wipe.secureReload")}</p>
              ) : null}
            </RadioOption>
          </RadioGroupField>
          <div className="flex flex-col gap-1">
            <TypeToConfirmField
              confirmText={shown.canonicaldevicefile}
              prompt={t("wipe.typePrompt", {
                device: shown.canonicaldevicefile,
              })}
              value={typed}
              onValueChange={setTyped}
            />
            <p id={hintId} className="text-sm text-muted-foreground">
              {t("wipe.typeHint")}
            </p>
          </div>
        </div>
      );
      break;
    }
  }

  const startError = confirming ? phase.startError : undefined;

  return (
    <Dialog
      open={control.open}
      onOpenChange={(open) => {
        if (!open) {
          dialog.close();
        }
      }}
      disablePointerDismissal
    >
      <DialogContent
        role="alertdialog"
        data-slot="wipe-dialog"
        aria-busy={checking || (confirming && phase.rechecking) || undefined}
        initialFocus={cancelRef}
        finalFocus={() =>
          startedRef.current ? panelHeadingRef.current : openerRef.current
        }
      >
        <div className="flex items-start gap-3">
          {confirming ? (
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-foreground"
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {title}
            </DialogTitle>
            <DialogDescription
              render={<div />}
              className="flex flex-col gap-2 text-foreground"
            >
              {description}
            </DialogDescription>
          </div>
        </div>
        {body}
        {startError !== undefined ? (
          <div role="alert" className="flex flex-col gap-1 text-sm">
            <p className="text-critical-label">{t("wipe.startFailed")}</p>
            {isRpcError(startError) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {startError.message}
              </ServerMessage>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose ref={cancelRef} render={<Button variant="neutral" />}>
            {confirming || checking ? t("wipe.cancel") : t("wipe.close")}
          </DialogClose>
          {confirming ? (
            <Button
              data-slot="wipe-confirm"
              variant="destructive"
              loading={phase.rechecking}
              disabled={!matches}
              focusableWhenDisabled
              aria-describedby={matches ? undefined : hintId}
              onClick={() => void confirm()}
            >
              {phase.rechecking ? t("wipe.checkingAgain") : t("wipe.confirm")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "The file system old-pc (ntfs, 931.5 GiB). It is not used on this NAS. Its files are lost." */
function FsHolds({
  fs,
  withSize,
}: {
  fs: Parameters<typeof WipeFsName>[0]["fs"];
  withSize: string | null;
}) {
  const { t } = useTranslation();
  const text =
    withSize === null
      ? t("wipe.holds.fsUnusedNoSize", { name: "\u0000", type: fs.type })
      : t("wipe.holds.fsUnused", {
          name: "\u0000",
          type: fs.type,
          size: withSize,
        });
  const [before, after] = text.split("\u0000");
  return (
    <>
      {before}
      <WipeFsName fs={fs} />
      {after}
    </>
  );
}
