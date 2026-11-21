// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID pages' reads put together (phase 5 RAID design 1.1, 2.1): each array with its state, its
// report's roles and what uses it, from the shared cache entries, and the one poll while an array is
// busy (P9). A 404 from MdMgmt means the plugin is not installed (0.10): the pages then show that and
// make no other RAID call.
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useMemo } from "react";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import {
  arrayState,
  arrayUsedBy,
  findArray,
  isBusy,
  readReport,
  type ArrayState,
  type ArrayUsedBy,
  type Report,
} from "../raid/raidModel.ts";
import {
  useConfiguredFs,
  useDetectedFs,
  useRaidArrays,
} from "./useDiskReads.ts";
import {
  useArrayDetail,
  useArrayDetails,
  useArraysPoll,
  useDetailPoll,
} from "./useRaidReads.ts";

/** The arrays read; "missing" when the plugin is not installed. */
export function useArraysRead() {
  const arrays = useRaidArrays();
  const missing =
    arrays.isError &&
    isRpcError(arrays.error) &&
    isRaidPluginMissing(arrays.error);
  return { arrays, missing };
}

/** An array as the pages show it. */
export interface ArrayView {
  row: MdArray;
  state: ArrayState;
  report: Report | null;
  detail: string | null;
  used: ArrayUsedBy;
}

function useUsedInputs() {
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  return {
    configured,
    detected,
    inputs: {
      configured: {
        data: configured.isError ? undefined : configured.data?.data,
        failed: configured.isError,
        error: configured.error,
      },
      detected: {
        data: detected.isError ? undefined : detected.data,
        failed: detected.isError,
        error: detected.error,
      },
    },
  };
}

/** The list (1.1): every array, each with its report for the counts and the progress. */
export function useRaidList() {
  const { arrays, missing } = useArraysRead();
  const used = useUsedInputs();
  const rows = missing ? undefined : arrays.data;
  const plain = useMemo(
    () =>
      (rows ?? []).map((row) => ({
        devicefile: row.devicefile,
        busy: isBusy(arrayState(row).kind),
      })),
    [rows],
  );
  const details = useArrayDetails(plain);
  const anyBusy = plain.some((r) => r.busy);
  const poll = useArraysPoll(anyBusy);
  const views: ArrayView[] | undefined = rows?.map((row, i) => {
    const detail = details[i]?.data;
    const text = typeof detail === "string" ? detail : null;
    const report = text === null ? null : readReport(text, row.devices);
    return {
      row,
      report,
      detail: text,
      state: arrayState(row, report, text),
      used: arrayUsedBy(row, used.inputs),
    };
  });
  return {
    arrays,
    missing,
    views,
    anyBusy,
    poll,
    configured: used.configured,
    detected: used.detected,
    usedFailed: used.inputs.configured.failed || used.inputs.detected.failed,
  };
}

/** One array's page (2.1): the row the address names, its report, and the poll while it is busy. */
export function useArrayView(address: string | null) {
  const { arrays, missing } = useArraysRead();
  const used = useUsedInputs();
  const row =
    address === null || missing || arrays.data === undefined
      ? undefined
      : findArray(arrays.data, address);
  const devicefile = row?.devicefile ?? "";
  const detail = useArrayDetail(devicefile, row !== undefined);
  const text = typeof detail.data === "string" ? detail.data : null;
  const report =
    row === undefined
      ? null
      : detail.isError
        ? ({ known: false } as const)
        : text === null
          ? null
          : readReport(text, row.devices);
  const state = row === undefined ? null : arrayState(row, report, text);
  const busy = state !== null && isBusy(state.kind);
  const poll = useArraysPoll(busy);
  useDetailPoll(devicefile, busy);
  const view: ArrayView | null =
    row === undefined || state === null
      ? null
      : {
          row,
          state,
          report,
          detail: text,
          used: arrayUsedBy(row, used.inputs),
        };
  return {
    arrays,
    missing,
    view,
    detail,
    busy,
    poll,
    configured: used.configured,
    detected: used.detected,
  };
}
