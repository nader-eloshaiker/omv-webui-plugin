// SPDX-License-Identifier: GPL-3.0-or-later
// A person's page (phase 5 users design 2, D1). The one path parameter is the account name, and only a
// value that passes OMV's name pattern reaches the page: anything else becomes null, which the page
// shows as not found without a person-specific call (UI-4). The page finds the row in the whole
// UserMgmt.getUserList read and uses that row's name for every call, never the address.
import { createFileRoute } from "@tanstack/react-router";
import { PersonRoutePage } from "../../../../components/pages/PersonPage.tsx";
import { isAccountAddress } from "../../../../users/nameRules.ts";

export const Route = createFileRoute("/_signedIn/usermgmt/users/$name")({
  params: {
    parse: ({ name }) => ({ name: isAccountAddress(name) ? name : null }),
    stringify: ({ name }) => ({ name: name ?? "" }),
  },
  component: PersonRoutePage,
});
