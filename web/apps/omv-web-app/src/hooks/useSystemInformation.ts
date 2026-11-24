// SPDX-License-Identifier: GPL-3.0-or-later
// System.getInformation for a page: the host name for everyone, and for an administrator the
// pending configuration changes, processor, memory and load. It reads the shell's cache entry and
// does not poll: the shell's combined read (live/useLive.ts) is the one poll of it, because TanStack
// Query runs one timer per observer and every caller here would otherwise add its own. A background
// call, so a read on mount never keeps an idle session alive (UI-14). One set of options, so every
// caller shares the one cache entry.
import { useSystemGetInformation } from "@omv-webui/react-api-omv/generated";
import { LIVE_STALE_MS } from "../live/liveDemand.ts";

export function useSystemInformation() {
  return useSystemGetInformation({
    request: { background: true },
    query: { staleTime: LIVE_STALE_MS },
  });
}
