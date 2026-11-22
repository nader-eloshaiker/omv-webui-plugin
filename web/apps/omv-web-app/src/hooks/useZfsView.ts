// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS pages' reads put together (phase 5 ZFS design 1.1, 2.1, 4.3): each pool with its own folder,
// its report read into a tree and a state, and the one poll while a pool is checked or rebuilt (P13).
// A 404 from Zfs means the plugin is not installed (0.11): the pages then show that and make no other
// ZFS call.
import type { ZfsObject } from "@omv-webui/react-api-omv/generated";
import { useMemo } from "react";
import { useMemoryStore } from "../shell/memoryStore.ts";
import { deleteRunOf, zfsActions } from "../zfs/zfsActions.ts";
import {
  findPool,
  fullLevel,
  isBusy,
  matchDisks,
  parsePoolReport,
  poolRoot,
  pools,
  poolState,
  worse,
  type PoolDisks,
  type PoolReport,
  type PoolState,
  type Status,
} from "../zfs/zfsModel.ts";
import {
  isZfsPluginMissing,
  useZfsList,
  useZfsListPoll,
  useZfsPoolDevices,
  useZfsReports,
} from "./useZfsReads.ts";

export interface PoolView {
  row: ZfsObject;
  /** The pool's own folder: the space for files (D6). */
  root: ZfsObject | undefined;
  /** "loading" until the report has been read once; "failed" when that read failed. */
  reportRead: "loading" | "failed" | "read";
  report: PoolReport;
  /** The report's text, for the technical details; null until read. */
  text: string | null;
  state: PoolState;
  /** The worse of the state and how full it is, for the roll-up. */
  status: Status;
  busy: boolean;
}

function viewOf(
  row: ZfsObject,
  rows: readonly ZfsObject[],
  read: { data?: unknown; isError: boolean },
): PoolView {
  const text = typeof read.data === "string" ? read.data : null;
  const report = parsePoolReport(text);
  const state = poolState(row, report);
  return {
    row,
    root: poolRoot(rows, row.path),
    reportRead: read.isError ? "failed" : text === null ? "loading" : "read",
    report,
    text,
    state,
    status: worse(state.status, fullLevel(row.capacity)),
    busy: isBusy(state),
  };
}

/** Whether the list read says the plugin is not installed. */
const missingOf = (list: { isError: boolean; error: unknown }) =>
  list.isError && isZfsPluginMissing(list.error);

/** The ZFS list (1.1): every pool with its report; the busy ones and the list polled. */
export function useZfsListView() {
  const list = useZfsList();
  const missing = missingOf(list);
  const rows = missing ? undefined : list.data?.data;
  const poolRows = useMemo(
    () => (rows === undefined ? [] : pools(rows)),
    [rows],
  );
  // The busy ones are known only once their reports are read: a first read, then the poll.
  const first = useZfsReports(
    poolRows.map((r) => ({ pool: r.path, busy: false })),
  );
  const views =
    rows === undefined
      ? undefined
      : poolRows.map((row, i) =>
          viewOf(row, rows, first[i] ?? { isError: false }),
        );
  const busy = (views ?? []).filter((v) => v.busy);
  useZfsReports(busy.map((v) => ({ pool: v.row.path, busy: true })));
  const anyBusy = busy.length > 0;
  const poll = useZfsListPoll(anyBusy);
  return {
    list,
    missing,
    views,
    anyBusy,
    poll,
    reports: first,
  };
}

/** One pool's page (2.1): the row the address names, its report and disks, the poll while busy. */
export function useZfsPoolView(address: string | null) {
  const list = useZfsList();
  const missing = missingOf(list);
  const rows = missing ? undefined : list.data?.data;
  const row =
    address === null || rows === undefined
      ? undefined
      : findPool(rows, address);
  const pool = row?.path ?? "";
  // A pool being deleted is not read again: a finished task refreshes every read, and the pool's
  // report would then fail for a pool that is gone.
  useMemoryStore(zfsActions);
  const live = deleteRunOf(pool) === undefined;
  const [read] = useZfsReports(
    row === undefined ? [] : [{ pool, busy: false, enabled: live }],
  );
  const view =
    row === undefined || rows === undefined
      ? null
      : viewOf(row, rows, read ?? { isError: false });
  const busy = view?.busy ?? false;
  useZfsReports(busy ? [{ pool, busy: true, enabled: live }] : []);
  const devices = useZfsPoolDevices(pool, row !== undefined && live, busy);
  const poll = useZfsListPoll(busy);
  const disks: PoolDisks =
    view === null || devices.isError
      ? { known: false }
      : matchDisks(view.report, devices.data);
  return {
    list,
    missing,
    rows,
    view,
    report: read,
    devices,
    disks,
    busy,
    poll,
  };
}
