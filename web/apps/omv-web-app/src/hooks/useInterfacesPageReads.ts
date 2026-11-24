// SPDX-License-Identifier: GPL-3.0-or-later
// What the name page, the Interfaces page and an interface's page read besides the connection (phase
// 5 network design 2.1, 3.1, 4.1): the stored interfaces as the rules read them (failed whenever the
// last read failed, 0.8), and the pending modules (the session's pending marks follow them by
// themselves, pending/savedMarks.ts).
import type { IfaceSettings, Read } from "../network/dto.ts";
import { readOf, storedList, useStoredInterfaces } from "./useNetworkReads.ts";
import { useSharesSystem } from "./useSharesReads.ts";

export function useStoredRead(options: { focus?: boolean } = {}): {
  read: Read<readonly IfaceSettings[]>;
  query: ReturnType<typeof useStoredInterfaces>;
} {
  const query = useStoredInterfaces(options);
  return {
    read: readOf<readonly IfaceSettings[]>({
      data: query.data === undefined ? undefined : storedList(query.data.data),
      isError: query.isError,
    }),
    query,
  };
}

/** The pending modules (System.getInformation, the shell's read); [] until read. */
export function useNetworkPending(): readonly string[] {
  return useSharesSystem().pending ?? [];
}
