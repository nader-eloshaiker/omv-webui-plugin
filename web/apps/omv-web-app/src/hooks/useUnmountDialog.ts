// SPDX-License-Identifier: GPL-3.0-or-later
// The unmount and removal dialog's state and its check (phase 5 file-systems design 5.2): the list, the
// shared folders and what is pending, read again each time the dialog opens and on confirm. Fail
// closed: a read that failed refuses.
import type {
  ConfiguredFilesystem,
  MountEntry,
} from "@omv-webui/react-api-omv/generated";
import { useRef, useState } from "react";
import { actionOf, isBusy } from "../filesystems/fsActions.ts";
import {
  findFsRow,
  unmountBlockers,
  usedBy,
  type UnmountBlocker,
} from "../filesystems/fsModel.ts";
import { useFsApi } from "./useFsApi.ts";

export type UnmountKind = "unmount" | "remove";

export type UnmountPhase =
  | { kind: "checking" }
  | { kind: "refused"; blockers: UnmountBlocker[] }
  | { kind: "unchecked"; error: unknown }
  | { kind: "preflight"; modules: string[] }
  | { kind: "gone" }
  | { kind: "confirm"; fs: ConfiguredFilesystem; rechecking: boolean };

export interface UnmountDialogControl {
  open: boolean;
  phase: UnmountPhase;
}

/** The dialog's state, and its check (5.2), for the section to open it. */
export function useUnmountDialog(
  address: string,
  kind: UnmountKind,
  entry: MountEntry | false | undefined,
) {
  const api = useFsApi();
  const [control, setControl] = useState<UnmountDialogControl>({
    open: false,
    phase: { kind: "checking" },
  });
  const runRef = useRef(0);

  const check = async (): Promise<UnmountPhase> => {
    let rows: ConfiguredFilesystem[];
    let pending: string[];
    try {
      [rows, pending] = await Promise.all([api.configured(), api.pending()]);
    } catch (error) {
      return { kind: "unchecked", error };
    }
    const shares = await api.shares().then(
      (data) => ({ data, failed: false, error: undefined }),
      (error: unknown) => ({ data: undefined, failed: true, error }),
    );
    const fresh = findFsRow(rows, address);
    if (fresh === undefined) {
      return { kind: "gone" };
    }
    const blockers = unmountBlockers(
      fresh,
      usedBy(fresh, entry, shares),
      isBusy(actionOf(address)),
      kind,
    );
    if (blockers.length > 0) {
      return { kind: "refused", blockers };
    }
    if (pending.length > 0) {
      return { kind: "preflight", modules: pending };
    }
    return { kind: "confirm", fs: fresh, rechecking: false };
  };

  const open = () => {
    const mine = ++runRef.current;
    setControl({ open: true, phase: { kind: "checking" } });
    void check().then((phase) => {
      if (runRef.current === mine) {
        setControl({ open: true, phase });
      }
    });
  };
  const close = () => {
    runRef.current += 1;
    setControl((c) => ({ ...c, open: false }));
  };
  return { control, setControl, open, close, check, runRef, api };
}
