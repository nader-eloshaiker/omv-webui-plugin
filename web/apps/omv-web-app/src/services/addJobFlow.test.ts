// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job" as it runs (phase 5 services design 5.6 to 5.8): the steps, the trial read from the
// VM's output, turning the job on against what was tried, and each failure.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  RsyncJob,
  RsyncSetRequest,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import type {
  TaskRegistry,
  TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { defaultScheduleValue } from "@omv-webui/react-ui-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearJobFlow,
  jobFlowAction,
  jobFlowSteps,
  jobFlowStore,
  startJobFlow,
  startTurnOn,
  type JobFlowApi,
} from "./addJobFlow.ts";
import { emptyRemote, type JobChoices } from "./jobModel.ts";
import { jobsSession } from "./jobsSession.ts";

const MEDIA = "00000000-0000-4000-8000-000000000002";
const BACKUP = "00000000-0000-4000-8000-000000000006";
const JOB = "00000000-0000-4000-8000-00000000000f";
const TRIAL = (
  CONTRACT_EXAMPLES.execGetOutput.rsyncTrialFinished.value as {
    output: string;
  }
).output;
const STORED = {
  ...CONTRACT_EXAMPLES.rsyncGet.local.value,
  password: false,
} as unknown as RsyncJob;

const folder = (uuid: string, name: string) =>
  ({
    uuid,
    name,
    reldirpath: `${name}/`,
    mntentref: "m1",
    status: "OK",
  }) as unknown as SharedFolder;

/** A registry whose tasks end at once with `output`, or fail with `message`. */
function registry(
  outcome: (label: string) => { output?: string; message?: string },
): TaskRegistry {
  const tasks = new Map<number, TaskSnapshot>();
  const settled = new Set<(t: TaskSnapshot) => void>();
  let next = 1;
  return {
    start(label, begin) {
      const id = next++;
      tasks.set(id, { id, label, state: "running", output: "", startedAt: 0 });
      void begin().then(
        () => {
          const { output = "", message } = outcome(label);
          const snap: TaskSnapshot = {
            id,
            label,
            state: message === undefined ? "done" : "failed",
            output,
            startedAt: 0,
            endedAt: 1,
            ...(message === undefined
              ? {}
              : {
                  error: new RpcError({
                    status: 500,
                    code: 0,
                    message,
                    operationId: "execGetOutput",
                  }),
                }),
          };
          tasks.set(id, snap);
          for (const l of [...settled]) {
            l(snap);
          }
        },
        (error: unknown) => {
          const snap: TaskSnapshot = {
            id,
            label,
            state: "failed",
            output: "",
            startedAt: 0,
            endedAt: 1,
            error: error as RpcError,
          };
          tasks.set(id, snap);
          for (const l of [...settled]) {
            l(snap);
          }
        },
      );
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

/** A NAS with Media and Backup and no job until Rsync.set makes one. */
function fakeApi(over: Partial<JobFlowApi> = {}) {
  let stored: RsyncJob | null = null;
  let pending: string[] = [];
  const sent: RsyncSetRequest[] = [];
  const api: JobFlowApi = {
    folders: vi.fn(() =>
      Promise.resolve([folder(MEDIA, "Media"), folder(BACKUP, "Backup")]),
    ),
    fileSystems: vi.fn(() => Promise.resolve([])),
    pending: vi.fn(() => Promise.resolve([...pending])),
    sshKeys: vi.fn(() => Promise.resolve([])),
    job: vi.fn(() =>
      stored === null
        ? Promise.reject(
            new RpcError({
              status: 500,
              code: 0,
              message: "gone",
              operationId: "rsyncGet",
            }),
          )
        : Promise.resolve(stored),
    ),
    set: vi.fn((request: RsyncSetRequest) => {
      sent.push(request);
      pending = ["rsync"];
      stored = {
        ...STORED,
        uuid: JOB,
        type: request.type,
        mode: request.mode,
        src: {
          sharedfolderref: request.srcsharedfolderref,
          uri: request.srcuri,
        },
        dest: {
          sharedfolderref: request.destsharedfolderref,
          uri: request.desturi,
        },
        authentication: request.authentication,
        enable: request.enable,
        optiondelete: request.optiondelete,
        optiondryrun: request.optiondryrun,
        minute: request.minute,
        hour: request.hour,
      };
      return Promise.resolve({ ...STORED, uuid: JOB } as never);
    }),
    execute: vi.fn(() => () => Promise.resolve("/tmp/handle")),
    apply: vi.fn(() => () => {
      pending = [];
      return Promise.resolve("/tmp/apply");
    }),
    ...over,
  };
  return {
    api,
    sent,
    setPending: (p: string[]) => (pending = p),
    setStored: (job: RsyncJob) => (stored = job),
  };
}

const CHOICES: JobChoices = {
  from: { kind: "folder", uuid: MEDIA },
  to: { kind: "folder", uuid: BACKUP },
  deletes: true,
  schedule: defaultScheduleValue,
  sendemail: false,
  comment: "",
};
const labels = (reg: TaskRegistry) => ({
  apply: "Apply",
  trial: "Copy job",
  registry: reg,
});
const trialRegistry = () =>
  registry((label) => (label === "Copy job" ? { output: TRIAL } : {}));
const settle = () =>
  vi.waitFor(() => {
    expect(jobFlowStore.getState().run?.busy).toBeNull();
  });
const statuses = () => {
  const run = jobFlowStore.getState().run;
  return Object.fromEntries(
    run?.steps.map((s) => [s, run.state[s]?.status]) ?? [],
  );
};

afterEach(() => {
  clearJobFlow();
  jobsSession.reset();
});

describe("the steps", () => {
  it("lists 5.6's steps for each kind", () => {
    expect(jobFlowSteps("try")).toEqual([
      "check",
      "saveTrial",
      "apply",
      "trial",
      "read",
    ]);
    expect(jobFlowSteps("on")).toEqual(["check", "save", "apply"]);
    expect(jobFlowSteps("turnOn")).toEqual(["saveOn", "applyOn"]);
  });

  it("saves a deleting job for trial runs, applies, runs the trial and reads it", async () => {
    const { api, sent } = fakeApi();
    expect(
      startJobFlow(
        api,
        labels(trialRegistry()),
        { choices: CHOICES, name: "Media to Backup" },
        "try",
      ),
    ).toBe(true);
    await settle();
    const run = jobFlowStore.getState().run;
    expect(run?.phase).toEqual({ kind: "trialDone" });
    expect(statuses()).toEqual({
      check: "succeeded",
      saveTrial: "succeeded",
      apply: "succeeded",
      trial: "succeeded",
      read: "succeeded",
    });
    expect(sent[0]).toMatchObject({
      optiondryrun: true,
      enable: false,
      optiondelete: true,
    });
    expect(run?.trial?.reading).toMatchObject({ copies: 2, deleteCount: 3 });
    expect(run?.uuid).toBe(JOB);
    expect(jobsSession.getState().trials[JOB]?.deleteCount).toBe(3);
    expect(jobsSession.getState().intended[JOB]).toBe(true);
    expect(jobsSession.getState().runs[JOB]).toBeDefined();
  });

  it("turns the job on after its trial: steps 6 and 7, trial runs off, on its schedule", async () => {
    const { api, sent } = fakeApi();
    startJobFlow(
      api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "Media to Backup" },
      "try",
    );
    await settle();
    jobFlowAction({ kind: "turnOn" });
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({ kind: "on" });
    expect(sent[1]).toMatchObject({
      uuid: JOB,
      optiondryrun: false,
      enable: true,
      optiondelete: true,
    });
    expect(statuses()).toMatchObject({
      saveOn: "succeeded",
      applyOn: "succeeded",
    });
  });

  it("refuses to turn on a job changed since its trial, and offers the trial again", async () => {
    const fake = fakeApi();
    startJobFlow(
      fake.api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "Media to Backup" },
      "try",
    );
    await settle();
    // Another administrator points it at another folder.
    fake.setStored({
      ...STORED,
      uuid: JOB,
      optiondelete: true,
      optiondryrun: true,
      dest: { sharedfolderref: "00000000-0000-4000-8000-000000000014" },
      destsharedfolderref: "00000000-0000-4000-8000-000000000014",
    });
    jobFlowAction({ kind: "turnOn" });
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({
      kind: "failed",
      at: "saveOn",
      failure: { kind: "changed" },
    });
    expect(fake.sent).toHaveLength(1);
  });

  it("saves and turns on a job that does not delete, in three steps", async () => {
    const { api, sent } = fakeApi();
    startJobFlow(
      api,
      labels(trialRegistry()),
      { choices: { ...CHOICES, deletes: false }, name: "Media to Backup" },
      "on",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({ kind: "on" });
    expect(sent[0]).toMatchObject({
      optiondryrun: false,
      enable: true,
      optiondelete: false,
    });
    expect(api.execute).not.toHaveBeenCalled();
  });

  it("never turns on a deleting job without its trial", () => {
    const { api } = fakeApi();
    expect(
      startJobFlow(
        api,
        labels(trialRegistry()),
        { choices: CHOICES, name: "x" },
        "on",
      ),
    ).toBe(false);
  });

  it("sends the rsync server's password once and keeps none", async () => {
    const { api, sent } = fakeApi();
    const pull: JobChoices = {
      ...CHOICES,
      deletes: false,
      from: {
        kind: "remote",
        remote: {
          ...emptyRemote("rsyncd"),
          host: "backup.example.org",
          module: "photos",
        },
      },
    };
    startJobFlow(
      api,
      labels(trialRegistry()),
      { choices: pull, name: "x" },
      "try",
      "EXAMPLE-PASSWORD",
    );
    await settle();
    expect(sent[0]?.password).toBe("EXAMPLE-PASSWORD");
    expect(JSON.stringify(jobFlowStore.getState())).not.toContain(
      "EXAMPLE-PASSWORD",
    );
    jobFlowAction({ kind: "turnOn", password: "EXAMPLE-PASSWORD" });
    await settle();
    expect(sent[1]?.password).toBe("EXAMPLE-PASSWORD");
    expect(JSON.stringify(jobFlowStore.getState())).not.toContain(
      "EXAMPLE-PASSWORD",
    );
  });
});

describe("failures (5.8)", () => {
  it("stops at the check when other changes are pending (R1), having saved nothing", async () => {
    const fake = fakeApi();
    fake.setPending(["samba"]);
    startJobFlow(
      fake.api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "x" },
      "try",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({
      kind: "failed",
      at: "check",
      failure: { kind: "pending", modules: ["samba"] },
    });
    expect(fake.sent).toHaveLength(0);
  });

  it("stops at the check when a refusal holds now", async () => {
    const { api } = fakeApi();
    startJobFlow(
      api,
      labels(trialRegistry()),
      {
        choices: { ...CHOICES, to: { kind: "folder", uuid: MEDIA } },
        name: "x",
      },
      "try",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toMatchObject({
      at: "check",
      failure: { kind: "refused", refusals: [{ kind: "same" }] },
    });
  });

  it("says the job was not saved, and tries the step again", async () => {
    const fake = fakeApi();
    const set = fake.api.set;
    let first = true;
    fake.api.set = vi.fn((request: RsyncSetRequest) => {
      if (first) {
        first = false;
        return Promise.reject(
          new RpcError({
            status: 500,
            code: 0,
            message: "Refused.",
            operationId: "rsyncSet",
          }),
        );
      }
      return set(request);
    });
    startJobFlow(
      fake.api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "x" },
      "try",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toMatchObject({
      at: "saveTrial",
      failure: { kind: "notSaved" },
    });
    jobFlowAction({ kind: "retry" });
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({ kind: "trialDone" });
  });

  it("pauses at the checkpoint when something else became pending (R10)", async () => {
    const fake = fakeApi();
    fake.api.set = vi.fn(() => {
      fake.setPending(["rsync", "samba"]);
      return Promise.resolve({ uuid: JOB } as never);
    });
    startJobFlow(
      fake.api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "x" },
      "try",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({
      kind: "alsoPending",
      at: "apply",
      others: ["samba"],
    });
  });

  it("keeps the job saved when the apply fails", async () => {
    const { api } = fakeApi();
    const reg = registry((label) =>
      label === "Apply" ? { message: "Apply failed." } : {},
    );
    startJobFlow(api, labels(reg), { choices: CHOICES, name: "x" }, "try");
    await settle();
    expect(jobFlowStore.getState().run?.phase).toMatchObject({
      at: "apply",
      failure: { kind: "apply" },
    });
    expect(jobFlowStore.getState().run?.uuid).toBe(JOB);
  });

  it("reads a failed trial with the job's own words, OMV's command dropped", async () => {
    const { api } = fakeApi();
    const message = (
      CONTRACT_EXAMPLES.execGetOutput.rsyncNotMountedFailed.value as {
        message: string;
      }
    ).message;
    const reg = registry((label) => (label === "Copy job" ? { message } : {}));
    startJobFlow(api, labels(reg), { choices: CHOICES, name: "x" }, "try");
    await settle();
    const run = jobFlowStore.getState().run;
    expect(run?.phase).toEqual({ kind: "trialDone" });
    expect(run?.trial?.outcome).toBe("failed");
    expect(run?.trial?.lines).toEqual([
      "[ERROR] Source storage device not mounted at </srv/dev-disk-by-uuid-00000000-0000-4000-8000-00000000000e/>!",
    ]);
    expect(jobsSession.getState().trials[JOB]).toBeUndefined();
  });

  it("says a trial that could not start, with the server's message", async () => {
    const { api } = fakeApi({
      execute: () => () =>
        Promise.reject(
          new RpcError({
            status: 500,
            code: 0,
            message: "Please apply the configuration changes first.",
            operationId: "rsyncExecute",
          }),
        ),
    });
    startJobFlow(
      api,
      labels(trialRegistry()),
      { choices: CHOICES, name: "x" },
      "try",
    );
    await settle();
    expect(jobFlowStore.getState().run?.phase).toMatchObject({
      at: "trial",
      failure: { kind: "trialStart" },
    });
  });
});

describe("turning a trial-only job on from its page (4.2)", () => {
  it("runs steps 6 and 7 when the trial seen is of the job as it is", async () => {
    const fake = fakeApi();
    const job = {
      ...STORED,
      uuid: JOB,
      optiondelete: true,
      optiondryrun: true,
      enable: false,
    };
    fake.setStored(job);
    const { trialKey } = await import("./jobModel.ts");
    startTurnOn(fake.api, labels(trialRegistry()), job, {
      name: "x",
      onSchedule: false,
      tried: trialKey(job),
      password: "",
    });
    await settle();
    expect(jobFlowStore.getState().run?.phase).toEqual({ kind: "on" });
    expect(fake.sent[0]).toMatchObject({ optiondryrun: false, enable: false });
  });

  it("refuses without a trial seen in this session", async () => {
    const fake = fakeApi();
    const job = {
      ...STORED,
      uuid: JOB,
      optiondelete: true,
      optiondryrun: true,
    };
    fake.setStored(job);
    startTurnOn(fake.api, labels(trialRegistry()), job, {
      name: "x",
      onSchedule: true,
      tried: null,
      password: "",
    });
    await settle();
    expect(jobFlowStore.getState().run?.phase).toMatchObject({
      failure: { kind: "changed" },
    });
    expect(fake.sent).toHaveLength(0);
  });
});
