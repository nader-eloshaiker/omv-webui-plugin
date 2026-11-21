// SPDX-License-Identifier: GPL-3.0-or-later
// Starting a wipe (phase 5 disks design 3.3, 3.6). Only the checked, typed confirmation calls this,
// with the row a re-read returned a moment before. The wipe runs as a task in the one registry, so it
// keeps being followed when the reader leaves the page; its handle stays inside the task helper (UI-5):
// this module keeps only the registry's id. Nothing retries it (UI-14).
import {
  taskRegistry,
  type TaskRegistry,
} from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { forgetWipe, markWiped, recordWipe } from "./diskSession.ts";

export interface WipeStart {
  /** The disk's stable device file from the fresh DiskMgmt.getList row: what DiskMgmt.wipe gets. */
  devicefile: string;
  /** The canonical device file, for the words ("/dev/sdb"). */
  device: string;
  serial: string;
  secure: boolean;
  /** The task's name in the Tasks menu: "Wipe disk /dev/sdb". */
  label: string;
  /** The task-starting call: the generated DiskMgmt.wipe mutation; resolves to the handle. */
  begin: () => Promise<string>;
}

/**
 * Start the wipe. Resolves with the registry's id once the server has accepted the call; rejects with
 * the server's error when the call itself was refused, in which case nothing was erased and the task is
 * forgotten. When the wipe succeeds, the disk is marked "wiped" for the session (P9).
 */
export function startWipe(
  start: WipeStart,
  registry: TaskRegistry = taskRegistry,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let accepted = false;
    let id = 0;
    id = registry.start(start.label, () =>
      start.begin().then((handle) => {
        accepted = true;
        resolve(id);
        return handle;
      }),
    );
    recordWipe(start.devicefile, {
      taskId: id,
      device: start.device,
      serial: start.serial,
      secure: start.secure,
    });
    const off = registry.onSettled((task) => {
      if (task.id !== id) {
        return;
      }
      off();
      if (!accepted) {
        // The task-starting call was refused: the wipe never began.
        registry.dismiss(id);
        forgetWipe(start.devicefile);
        reject(isRpcError(task.error) ? task.error : new Error("not started"));
        return;
      }
      if (task.state === "done") {
        markWiped(start.devicefile, task.endedAt ?? Date.now());
      }
    });
  });
}
