// SPDX-License-Identifier: GPL-3.0-or-later
// The task helper: output in order, back-off, the result, failure, stop, and polling that ends.
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  configApplyChangesBg,
  configRevertChangesBg,
} from "../generated/omv/config/config.ts";
import { replyOf } from "../mocks/handlers.ts";
import {
  FIRST_DELAY,
  MAX_DELAY,
  createTaskRegistry,
  nextDelay,
  type TaskSnapshot,
} from "./registry.ts";

const HANDLE = "/tmp/bgstatusTEST";
const server = setupServer();
const execCalls: {
  method: string;
  params: { pos?: number };
  options: unknown;
}[] = [];

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  execCalls.length = 0;
});
afterAll(() => server.close());

/** Answer the task start with HANDLE, then each getOutput poll from `polls` in turn. */
function script(
  polls: (
    | Partial<{ output: string; running: boolean; pendingOutput: boolean }>
    | { fail: string }
  )[],
) {
  let i = 0;
  let pos = 0;
  server.use(
    http.post("*/rpc.php", async ({ request }) => {
      const body = (await request.json()) as {
        service: string;
        method: string;
        params: { pos?: number };
        options?: unknown;
      };
      if (body.service === "Config") {
        return replyOf({ status: 200, value: HANDLE });
      }
      execCalls.push({
        method: body.method,
        params: body.params,
        options: body.options,
      });
      if (body.method === "stop") {
        return replyOf({ status: 200, value: null });
      }
      const step = polls[Math.min(i++, polls.length - 1)]!;
      if ("fail" in step) {
        return replyOf({ status: 500, message: step.fail });
      }
      const output = step.output ?? "";
      pos += output.length;
      return replyOf({
        status: 200,
        value: {
          filename: HANDLE,
          pos,
          output,
          running: step.running ?? true,
          pendingOutput: step.pendingOutput ?? false,
        },
      });
    }),
  );
}

/** A registry whose waits resolve at once, recording each delay asked for. */
function registry() {
  const waits: number[] = [];
  const r = createTaskRegistry(async (ms, signal) => {
    waits.push(ms);
    if (signal.aborted) {
      throw signal.reason;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { r, waits };
}

const settled = (r: ReturnType<typeof createTaskRegistry>) =>
  new Promise<TaskSnapshot>((resolve) => {
    const off = r.onSettled((t) => {
      off();
      resolve(t);
    });
  });

describe("nextDelay", () => {
  it.each([
    [FIRST_DELAY, false, false, 1000],
    [1000, false, false, MAX_DELAY],
    [MAX_DELAY, false, false, MAX_DELAY],
    [MAX_DELAY, true, false, FIRST_DELAY],
    [MAX_DELAY, true, true, 0],
  ])(
    "from %i ms, output %s, pending %s -> %i ms",
    (current, got, pending, want) => {
      expect(nextDelay(current, got, pending)).toBe(want);
    },
  );
});

describe("the task registry", () => {
  it("follows a task to the end, accumulating output and parsing the declared result", async () => {
    script([{ output: '["ss' }, {}, {}, { output: 'h"]', running: false }]);
    const { r, waits } = registry();
    const done = settled(r);
    const id = r.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    expect(r.get(id)).toMatchObject({
      id,
      label: "Applying changes",
      state: "running",
      output: "",
    });
    const task = await done;
    expect(task).toMatchObject({
      state: "done",
      output: '["ssh"]',
      result: ["ssh"],
    });
    expect(waits).toEqual([500, 500, 1000, 2000]);
    expect(execCalls.map((c) => c.params.pos)).toEqual([0, 4, 4, 4]);
    // Every poll is a background call (UI-14), and none follows the last one (A6).
    expect(execCalls.every((c) => c.method === "getOutput")).toBe(true);
    expect(
      execCalls.every(
        (c) => JSON.stringify(c.options) === '{"updatelastaccess":false}',
      ),
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(execCalls).toHaveLength(4);
  });

  it("keeps the output as text when the operation declares no result", async () => {
    script([{ output: "", running: false }]);
    const { r } = registry();
    const done = settled(r);
    r.start("Discarding changes", () =>
      configRevertChangesBg({ filename: "" }),
    );
    const task = await done;
    expect(task.state).toBe("done");
    expect("result" in task).toBe(false);
  });

  it("surfaces a failed task's message", async () => {
    script([{ output: "step 1\n" }, { fail: "The apply failed." }]);
    const { r } = registry();
    const done = settled(r);
    r.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    const task = await done;
    expect(task.state).toBe("failed");
    expect(task.error).toMatchObject({
      status: 500,
      message: "The apply failed.",
    });
    expect(task.output).toBe("step 1\n");
  });

  it("stops a task on the server and stops polling", async () => {
    script([{ output: "working\n" }]);
    const { r } = registry();
    const id = r.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    await new Promise<void>((resolve) => {
      const off = r.subscribe(() => {
        if (r.get(id)?.output) {
          off();
          resolve();
        }
      });
    });
    await r.stop(id);
    expect(r.get(id)?.state).toBe("stopped");
    expect(execCalls.at(-1)).toMatchObject({
      method: "stop",
      params: { filename: HANDLE },
    });
    const count = execCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(execCalls).toHaveLength(count);
  });

  it("forgets every task on clear, and stops polling them", async () => {
    script([{ output: "working\n" }]);
    const { r } = registry();
    r.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    r.clear();
    expect(r.list()).toEqual([]);
    const count = execCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(execCalls).toHaveLength(count);
  });

  it("never exposes the handle in a snapshot (UI-5)", async () => {
    script([{ output: "x", running: false }]);
    const { r } = registry();
    const done = settled(r);
    r.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    const task = await done;
    expect(JSON.stringify(task)).not.toContain("bgstatus");
    expect(JSON.stringify(r.list())).not.toContain("bgstatus");
  });
});
