// SPDX-License-Identifier: GPL-3.0-or-later
// Feeds the pending-modules read into the saved marks (savedMarks.ts): every reply of
// System.getInformation's cache entry, from any caller (the shell's poll, a page's read, a fresh read
// before a write, the re-read after a dirty write or a finished task), and how many fetches of it are
// on their way. The query cache reports each change as it happens, in the order the replies land, so
// no reply is seen late because a page rendered it late.
import {
  getSystemGetInformationQueryKey,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import type { Query, QueryClient } from "@tanstack/react-query";
import { pendingModules } from "./modules.ts";
import { savedMarks, type SavedMarks } from "./savedMarks.ts";

const INFORMATION_KEY = JSON.stringify(getSystemGetInformationQueryKey());

/** Follow the query client's pending-modules read. Returns a disconnect. */
export function connectSavedMarks(
  queryClient: QueryClient,
  marks: SavedMarks = savedMarks,
): () => void {
  const cache = queryClient.getQueryCache();
  const isInformation = (query: Query) =>
    JSON.stringify(query.queryKey) === INFORMATION_KEY;
  // The entries of that read with a fetch on its way (a removed entry's fetch is cancelled with it).
  const fetching = new Set<Query>();
  const follow = (query: Query) => {
    if (query.state.fetchStatus === "idle") {
      fetching.delete(query);
    } else {
      fetching.add(query);
    }
  };
  for (const query of cache.getAll()) {
    if (isInformation(query)) {
      follow(query);
    }
  }
  marks.readsInFlight(fetching.size);
  const off = cache.subscribe((event) => {
    if (!isInformation(event.query)) {
      return;
    }
    if (event.type === "removed") {
      fetching.delete(event.query);
    } else if (event.type === "updated") {
      // A reply from the server; a write into the cache by the app (setQueryData) is not a reading.
      if (event.action.type === "success" && event.action.manual !== true) {
        // The entry is written only by its generated query, from a reply the transport has
        // normalised to the operation's response schema.
        const data = event.query.state.data as SystemInformation | undefined;
        marks.answered(pendingModules(data?.dirtyModules));
      }
      follow(event.query);
    } else {
      return;
    }
    marks.readsInFlight(fetching.size);
  });
  return () => {
    off();
    marks.readsInFlight(0);
  };
}
