// SPDX-License-Identifier: GPL-3.0-or-later
// System.getInformation for the shell: the host name for everyone, and for an administrator the
// pending configuration changes, polled in the background so the poll never keeps an idle session
// alive (UI-14). One set of options, so every caller shares the one cache entry and its poll.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { useSystemGetInformation } from "@omv-webui/react-api-omv/generated";

/** How often an administrator's shell asks whether changes are pending (another tab may add some). */
export const PENDING_POLL_MS = 20_000;

export function useSystemInformation(role: Role) {
  return useSystemGetInformation({
    request: { background: true },
    query: {
      refetchInterval: role === "admin" ? PENDING_POLL_MS : false,
      staleTime: 10_000,
    },
  });
}
