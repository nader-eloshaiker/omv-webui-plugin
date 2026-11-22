// SPDX-License-Identifier: GPL-3.0-or-later
// A group's member picker rows (phase 5 users design 9.4; 0.5): one per person from getUserList, in
// natural order, with their description, and a person whose main group it is unavailable with the
// reason. Names and descriptions shown with their bidirectional controls as "�". Pure.
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import type { MemberPickerRow } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { inertBidi } from "../format/isolate.ts";
import { naturalCompare } from "./groupsTable.ts";

/** The picker's rows and the people whose main group this is (0.5). */
export function memberRows(
  users: readonly UserAccount[],
  mainGroup: readonly string[],
  reason: (name: string) => ReactNode,
): MemberPickerRow[] {
  return [...users]
    .sort((a, b) => naturalCompare(a.name, b.name))
    .map((u) => ({
      id: u.name,
      name: inertBidi(u.name),
      ...(u.comment === undefined || u.comment === ""
        ? {}
        : { description: inertBidi(u.comment) }),
      ...(mainGroup.includes(u.name)
        ? { unavailableReason: reason(u.name) }
        : {}),
    }));
}
