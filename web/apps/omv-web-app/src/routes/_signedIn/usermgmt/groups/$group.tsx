// SPDX-License-Identifier: GPL-3.0-or-later
// A group's page (phase 5 users design 9). The parameter is the group's name, checked against OMV's
// name pattern before anything is read and found in the whole UserMgmt.getGroupList read (UI-4).
import { createFileRoute } from "@tanstack/react-router";
import { GroupRoutePage } from "../../../../components/pages/GroupPage.tsx";
import { isAccountAddress } from "../../../../users/nameRules.ts";

export const Route = createFileRoute("/_signedIn/usermgmt/groups/$group")({
  params: {
    parse: ({ group }) => ({ group: isAccountAddress(group) ? group : null }),
    stringify: ({ group }) => ({ group: group ?? "" }),
  },
  component: GroupRoutePage,
});
