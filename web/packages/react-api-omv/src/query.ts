// SPDX-License-Identifier: GPL-3.0-or-later
// The query client's policy and its wiring to the transport (docs/02, "Cross-cutting behaviour";
// UI-14). One place, so no page handles 401 or pending changes itself.
import { QueryClient, type Query } from "@tanstack/react-query";
import { taskRegistry, type TaskRegistry } from "./tasks/registry.ts";
import { RpcError } from "./transport/RpcError.ts";
import {
  forgetTaskHandles,
  onPendingChanges,
  onSessionEnded,
} from "./transport/rpcClient.ts";

/** Queries retry only a network failure, at most twice. Mutations never retry (UI-14). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          error instanceof RpcError && error.kind === "network" && failures < 2,
      },
      mutations: { retry: false },
    },
  });
}

// The reads whose answer a pending configuration change alters.
const PENDING_CHANGES_URLS = new Set([
  "/rpc/Config/isDirty",
  "/rpc/System/getInformation",
]);
const isPendingChangesQuery = (query: Query) =>
  PENDING_CHANGES_URLS.has(String(query.queryKey[1]));

/**
 * Wire a query client to the transport:
 * - after a mutation marked x-omv-dirty succeeds, refetch the pending-changes reads;
 * - after a task ends (an apply or revert changes what the system reports), refetch everything;
 * - when the session ends (401), stop following tasks, cancel queries and drop all server data.
 * The application also subscribes to onSessionEnded to show sign-in. Returns a disconnect.
 */
export function connectQueryClient(
  queryClient: QueryClient,
  registry: TaskRegistry = taskRegistry,
): () => void {
  const offs = [
    onPendingChanges(() => {
      void queryClient.invalidateQueries({ predicate: isPendingChangesQuery });
    }),
    registry.onSettled(() => {
      void queryClient.invalidateQueries();
    }),
    onSessionEnded(() => {
      registry.clear();
      forgetTaskHandles();
      void queryClient.cancelQueries();
      queryClient.clear();
    }),
  ];
  return () => {
    for (const off of offs) {
      off();
    }
  };
}
