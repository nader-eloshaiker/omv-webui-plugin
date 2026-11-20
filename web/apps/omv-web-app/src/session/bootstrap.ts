// SPDX-License-Identifier: GPL-3.0-or-later
// How the interface learns, on load, whether a session exists (docs/03, "Login": it makes its first
// ordinary call and handles 401). Two reads every signed-in user may make, in parallel:
// - System.getInformation decides it: a 401 (or no answer) means show sign-in. Its answer is full
//   only for an administrator, which gives the role (role.ts); it also stays in the query cache for
//   the shell's host name.
// - UserMgmt.getUserByContext gives the user name. If only it fails, the session still stands and
//   the name is simply not known.
// Nothing is read from storage or the URL, and nothing is written there (UI-6, UI-13).
import {
  getSystemGetInformationQueryOptions,
  getUserMgmtGetUserByContextQueryOptions,
} from "@omv-webui/react-api-omv/generated";
import type { QueryClient } from "@tanstack/react-query";
import { roleOf } from "./role.ts";
import { SIGNED_OUT, type SessionState } from "./sessionStore.ts";

export async function probeSession(
  queryClient: QueryClient,
): Promise<SessionState> {
  const [information, account] = await Promise.allSettled([
    queryClient.fetchQuery(
      getSystemGetInformationQueryOptions({ query: { retry: false } }),
    ),
    queryClient.fetchQuery(
      getUserMgmtGetUserByContextQueryOptions({ query: { retry: false } }),
    ),
  ]);
  if (information.status === "rejected") {
    // The probe's failures are an answer, not something to keep: drop them so nothing refetches.
    queryClient.clear();
    return SIGNED_OUT;
  }
  return {
    status: "signedIn",
    role: roleOf(information.value),
    username: account.status === "fulfilled" ? account.value.name : null,
  };
}
