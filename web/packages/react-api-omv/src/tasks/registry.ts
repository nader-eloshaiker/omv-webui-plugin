// SPDX-License-Identifier: GPL-3.0-or-later
// The task helper and the one task registry for the whole application (docs/02, "Cross-cutting
// behaviour"; docs/03, "Background tasks"). A task is started by a call that returns a handle; the
// registry follows it with Exec.getOutput until it ends, so it keeps being followed when the user
// moves to another page. Handles stay inside this module and the transport (UI-5): a snapshot
// carries the registry's own id, never the handle.
import { SCHEMAS } from "../contract/generated/operations.ts";
import { execGetOutput, execStop } from "../generated/omv/exec/exec.ts";
import { RpcError } from "../transport/RpcError.ts";
import { taskResultOf } from "../transport/rpcClient.ts";
import { normalise } from "../transport/schema.ts";

export type TaskState = "running" | "done" | "failed" | "stopped";

export interface TaskSnapshot {
  readonly id: number;
  /** What the interface calls the task, e.g. "Applying changes". */
  readonly label: string;
  readonly state: TaskState;
  /** Plain text, rendered as text (UI-2). */
  readonly output: string;
  /** The parsed result, when the operation declares a result schema and the task succeeded. */
  readonly result?: unknown;
  readonly error?: RpcError;
}

/** Waits `ms` unless aborted. Tests pass their own. */
export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

const realWait: Wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Poll at 500 ms while output arrives, backing off to 2 s when there is none (docs/03). */
export const FIRST_DELAY = 500;
export const MAX_DELAY = 2000;
export const nextDelay = (
  current: number,
  gotOutput: boolean,
  pending: boolean,
): number =>
  pending ? 0 : gotOutput ? FIRST_DELAY : Math.min(current * 2, MAX_DELAY);

interface Running {
  snapshot: TaskSnapshot;
  handle: string | undefined;
  controller: AbortController;
}

export interface TaskRegistry {
  /** Start a task: `begin` makes the task-starting call and resolves to its handle. */
  start(label: string, begin: () => Promise<string>): number;
  /** Stop a running task on the server. */
  stop(id: number): Promise<void>;
  get(id: number): TaskSnapshot | undefined;
  list(): readonly TaskSnapshot[];
  subscribe(listener: () => void): () => void;
  /** Called with every task that ends, whatever the outcome. */
  onSettled(listener: (task: TaskSnapshot) => void): () => void;
  /** Stop following every task and forget them (sign-out, session end). Tasks keep running on the server. */
  clear(): void;
}

export function createTaskRegistry(wait: Wait = realWait): TaskRegistry {
  const tasks = new Map<number, Running>();
  const listeners = new Set<() => void>();
  const settledListeners = new Set<(task: TaskSnapshot) => void>();
  let list: readonly TaskSnapshot[] = [];
  let nextId = 1;

  const publish = () => {
    list = [...tasks.values()].map((t) => t.snapshot);
    for (const l of [...listeners]) {
      l();
    }
  };
  const update = (task: Running, change: Partial<TaskSnapshot>) => {
    task.snapshot = { ...task.snapshot, ...change };
    publish();
    if (task.snapshot.state !== "running") {
      for (const l of [...settledListeners]) {
        l(task.snapshot);
      }
    }
  };

  async function follow(task: Running, begin: () => Promise<string>) {
    const { signal } = task.controller;
    try {
      const handle = await begin();
      task.handle = handle;
      const resultSchema = taskResultOf(handle);
      let pos = 0;
      let delay = FIRST_DELAY;
      let output = "";
      for (;;) {
        await wait(delay, signal);
        const reply = await execGetOutput(
          { filename: handle, pos },
          { background: true },
          signal,
        );
        output += reply.output;
        pos = reply.pos;
        if (!reply.running && !reply.pendingOutput) {
          let result: unknown;
          if (resultSchema) {
            const schema = SCHEMAS[resultSchema];
            result = schema
              ? normalise(JSON.parse(output) as unknown, schema, SCHEMAS)
              : undefined;
          }
          update(task, {
            state: "done",
            output,
            ...(result !== undefined && { result }),
          });
          return;
        }
        if (reply.output) {
          update(task, { output });
        }
        delay = nextDelay(delay, reply.output !== "", reply.pendingOutput);
      }
    } catch (e) {
      if (signal.aborted) {
        if (task.snapshot.state === "running") {
          update(task, { state: "stopped" });
        }
        return;
      }
      const error =
        e instanceof RpcError
          ? e
          : new RpcError({
              status: 0,
              code: null,
              message: "The task's result could not be read.",
              operationId: "execGetOutput",
            });
      update(task, { state: "failed", error });
    }
  }

  return {
    start(label, begin) {
      const id = nextId++;
      const task: Running = {
        snapshot: { id, label, state: "running", output: "" },
        handle: undefined,
        controller: new AbortController(),
      };
      tasks.set(id, task);
      publish();
      void follow(task, begin);
      return id;
    },
    async stop(id) {
      const task = tasks.get(id);
      if (!task || task.snapshot.state !== "running") {
        return;
      }
      const { handle } = task;
      task.controller.abort();
      if (handle !== undefined) {
        await execStop({ filename: handle });
      }
      update(task, { state: "stopped" });
    },
    get: (id) => tasks.get(id)?.snapshot,
    list: () => list,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onSettled(listener) {
      settledListeners.add(listener);
      return () => settledListeners.delete(listener);
    },
    clear() {
      for (const task of tasks.values()) {
        task.controller.abort();
      }
      tasks.clear();
      publish();
    },
  };
}

/** The application's registry. */
export const taskRegistry = createTaskRegistry();
