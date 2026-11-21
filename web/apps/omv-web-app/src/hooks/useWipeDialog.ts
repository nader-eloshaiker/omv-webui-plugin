// SPDX-License-Identifier: GPL-3.0-or-later
// The wipe dialog's state and its first check (phase 5 disks design 3.2), and the disk's size as the
// confirmation names it (D20).
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionMarks } from "../disks/diskUse.ts";
import { labelSize } from "../disks/diskWords.ts";
import { phaseAfterCheck, type WipeDialogPhase } from "../disks/wipe.ts";
import { formatBytes, parseByteCount } from "../format/format.ts";
import { useRecheckDisk } from "./useDiskReads.ts";

/** "3.6 TiB (4 TB on the label)": the binary size, and the size printed on the disk's label (D20). */
export function useDiskSizeText() {
  const { t } = useTranslation();
  return (size: string): string => {
    const bytes = parseByteCount(size);
    if (bytes === null) {
      return "";
    }
    const label = labelSize(bytes);
    return label === null
      ? formatBytes(bytes)
      : t("disk.fact.sizeLabel", {
          size: formatBytes(bytes),
          label: t("format.sizeDecimal", label),
        });
  };
}

export interface WipeDialogControl {
  open: boolean;
  phase: WipeDialogPhase;
}

/**
 * The dialog's state and its first check, for the section to open it from "Wipe disk…". Every open
 * starts empty: nothing typed, Quick chosen.
 */
export function useWipeDialog(marks: SessionMarks) {
  const recheck = useRecheckDisk();
  const [control, setControl] = useState<WipeDialogControl>({
    open: false,
    phase: { phase: "checking" },
  });
  // Each opening's check; a result that arrives after the dialog closed or reopened is dropped.
  const runRef = useRef(0);
  const open = (shown: DiskDevice) => {
    const mine = ++runRef.current;
    setControl({ open: true, phase: { phase: "checking" } });
    void recheck(shown, marks).then((outcome) => {
      if (runRef.current === mine) {
        setControl({ open: true, phase: phaseAfterCheck(outcome) });
      }
    });
  };
  const close = () => {
    runRef.current += 1;
    setControl((c) => ({ ...c, open: false }));
  };
  return { control, setControl, open, close, runRef, recheck };
}
