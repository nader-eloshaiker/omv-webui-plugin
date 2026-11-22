// SPDX-License-Identifier: GPL-3.0-or-later
// A task registry for the users flows' unit tests: each task ends as `outcome` says as soon as its
// start resolves, without following anything over the network.
import type {
  TaskRegistry,
  TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { RpcError } from "@omv-webui/react-api-omv/transport";

export function fakeRegistry(
  outcome: () => "done" | "failed" = () => "done",
): TaskRegistry {
  const tasks = new Map<number, TaskSnapshot>();
  const settled = new Set<(t: TaskSnapshot) => void>();
  let next = 1;
  return {
    start(label, begin) {
      const id = next++;
      tasks.set(id, { id, label, state: "running", output: "", startedAt: 0 });
      void begin().then(() => {
        const state = outcome();
        const snap: TaskSnapshot = {
          id,
          label,
          state,
          output: "",
          startedAt: 0,
          endedAt: 1,
          ...(state === "failed"
            ? {
                error: new RpcError({
                  status: 500,
                  code: null,
                  message: "Apply failed.",
                  operationId: "configApplyChangesBg",
                }),
              }
            : {}),
        };
        tasks.set(id, snap);
        for (const l of [...settled]) {
          l(snap);
        }
      });
      return id;
    },
    stop: () => Promise.resolve(),
    get: (id) => tasks.get(id),
    list: () => [...tasks.values()],
    subscribe: () => () => undefined,
    onSettled(listener) {
      settled.add(listener);
      return () => settled.delete(listener);
    },
    dismiss: () => undefined,
    clear: () => undefined,
  };
}
