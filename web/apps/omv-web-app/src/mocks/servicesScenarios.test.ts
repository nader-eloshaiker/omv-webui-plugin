// SPDX-License-Identifier: GPL-3.0-or-later
// The services stories of the mock (phase 5 services design 16): every reply has the contract's shape
// once the transport has removed and replaced what the contract says, the stored records have the
// captured examples' fields, every request sent here passes the contract's form schema, and the answers
// remember what the pages do, with the pending modules, refusals, messages and task outputs the test VM
// showed.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
// Test code only: the contract's tables and the transport's own reply steps, to check every reply as
// the pages receive it.
import {
  OPERATIONS,
  SCHEMAS,
} from "../../../../packages/react-api-omv/src/contract/generated/operations.ts";
import type { OperationEntry } from "../../../../packages/react-api-omv/src/contract/types.ts";
import { withoutOmitted } from "../../../../packages/react-api-omv/src/transport/omit.ts";
import { withPresence } from "../../../../packages/react-api-omv/src/transport/presence.ts";
import {
  normalise,
  validate,
} from "../../../../packages/react-api-omv/src/transport/schema.ts";
import {
  newMockSession,
  scenarioAnswers,
  type ScenarioName,
} from "./scenarios.ts";
import {
  CHECK_FAILS_AFTER_MS,
  EXAMPLE_PASSWORD,
  GONE_FOLDER,
  HOLD_POLLS,
  JOBS_ADD_FAILURES_IN_TURN,
  jobsAddFailureOf,
  NEW_OBJECT,
  SERVICES_FOLDERS,
  SERVICES_JOBS,
  SERVICES_KEY,
  SERVICES_SCENARIOS,
  SERVICES_SHARES,
} from "./servicesScenarios.ts";

type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);
type Row = Record<string, unknown>;
interface List {
  total: number;
  data: Row[];
}

const entryOf = (operationId: string): OperationEntry | undefined =>
  Object.values(OPERATIONS as Record<string, OperationEntry>).find(
    (e) => e.operationId === operationId,
  );

/** A reply as the transport hands it on: omitted fields removed, presence fields replaced, normalised. */
function delivered(operationId: string, value: unknown): unknown {
  const entry = entryOf(operationId);
  const schema = entry?.response;
  const stripped = withPresence(
    withoutOmitted(value, entry?.omit),
    entry?.presence,
  );
  return schema ? normalise(stripped, schema, SCHEMAS) : stripped;
}

function checked(
  operationId: string,
  answer: string | FixedAnswer | undefined,
) {
  expect(answer, operationId).toBeDefined();
  if (typeof answer === "string" || answer === undefined) {
    return answer;
  }
  if (answer.status === 200) {
    const schema = entryOf(operationId)?.response;
    if (schema === null || schema === undefined) {
      expect(answer.value ?? null, operationId).toBeNull();
    } else {
      expect(
        validate(delivered(operationId, answer.value), schema, SCHEMAS),
        operationId,
      ).toEqual([]);
    }
  } else {
    expect(answer.message, operationId).toEqual(expect.any(String));
  }
  return answer;
}

/** A request held first to the contract's form schema of its operation. */
function sent(
  schema: { "~standard": { validate: (value: unknown) => unknown } },
  params: object,
): object {
  const result = schema["~standard"].validate(params) as {
    issues?: readonly { message: string }[];
  };
  expect(
    result.issues?.map((i) => i.message),
    JSON.stringify(params),
  ).toBeUndefined();
  return params;
}

const ALL = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};
const APPLY = CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename;
const REVERT = CONTRACT_EXAMPLES.configRevertChangesBg.reverted.value;
const PENDING = "Please apply the configuration changes first.";
const FOLDER = SERVICES_FOLDERS;
/** The six modules a folder's first NFS entry, and the removal of its last, mark (observed). */
const MOUNT_MODULES = ["avahi", "collectd", "fstab", "monit", "nfs", "quota"];

const keys = (value: unknown) => Object.keys(value as object).sort();

/** A copy job to save, as the add flow sends it (design 0.11): every field, the unused side empty. */
function newJob(over: Row = {}): Row {
  return {
    uuid: NEW_OBJECT,
    enable: false,
    sendemail: false,
    comment: "",
    type: "local",
    mode: "push",
    srcsharedfolderref: FOLDER.photos,
    srcuri: "",
    destsharedfolderref: FOLDER.backup,
    desturi: "",
    minute: ["0"],
    hour: ["3"],
    dayofmonth: ["*"],
    month: ["*"],
    dayofweek: ["*"],
    everynminute: false,
    everynhour: false,
    everyndayofmonth: false,
    optionrecursive: true,
    optiontimes: true,
    optiongroup: true,
    optionowner: true,
    optioncompress: false,
    optionarchive: true,
    optiondelete: false,
    optionquiet: false,
    optionperms: true,
    optionacls: false,
    optionxattrs: false,
    optiondryrun: true,
    optionpartial: false,
    extraoptions: "",
    authentication: "password",
    password: "",
    sshcertificateref: "",
    sshport: 22,
    ...over,
  };
}

function story(scenario: ScenarioName) {
  const session = newMockSession(true);
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const raw = (operationId: string, params: unknown = {}) => {
    const answer = answers[operationId];
    return typeof answer === "function"
      ? answer({ params, options: undefined })
      : answer;
  };
  const ask = (operationId: string, params: unknown = {}) =>
    checked(operationId, raw(operationId, params)) as FixedAnswer;
  /** The reply as OMV sends it (before the transport). */
  const value = <T>(operationId: string, params: unknown = {}): T => {
    const answer = ask(operationId, params);
    expect(answer, operationId).toMatchObject({ status: 200 });
    return answer.value as T;
  };
  /** The reply as the page receives it (after the transport). */
  const page = <T>(operationId: string, params: unknown = {}): T =>
    delivered(operationId, value(operationId, params)) as T;
  const failure = (operationId: string, params: unknown = {}) => {
    const answer = ask(operationId, params);
    expect(answer.status, operationId).not.toBe(200);
    return answer;
  };
  const pending = () =>
    Object.keys(
      value<{ dirtyModules: object }>("systemGetInformation").dirtyModules,
    ).sort();
  /** The last poll of an apply or undo: the example's name ("appliedFinished", "applyFailed"). */
  const apply = () =>
    ask("execGetOutput", { filename: APPLY, pos: 0 }) as unknown as string;
  const undo = () =>
    ask("execGetOutput", { filename: REVERT, pos: 0 }) as unknown as string;
  /** Follow a task to its end, as the task helper does: output since `pos`, until it ends or fails. */
  const follow = (handle: string, maxPolls = 10_000) => {
    let pos = 0;
    let output = "";
    let polls = 0;
    for (;;) {
      polls += 1;
      const answer = ask("execGetOutput", { filename: handle, pos });
      if (answer.status !== 200) {
        return { output, polls, error: answer.message ?? "" };
      }
      const reply = answer.value as {
        output: string;
        pos: number;
        running: boolean;
        pendingOutput: boolean;
      };
      output += reply.output;
      pos = reply.pos;
      if (!reply.running && !reply.pendingOutput) {
        return { output, polls, error: undefined };
      }
      if (polls >= maxPolls) {
        return { output, polls, error: undefined, stillRunning: true };
      }
    }
  };
  const jobs = () => value<List>("rsyncGetList", ALL).data;
  const nfsShares = () => value<List>("nfsGetShareList", ALL).data;
  const modules = () => value<List>("rsyncdGetModuleList", ALL).data;
  const status = (service: string) =>
    value<{ data: Row[] }>("servicesGetStatus").data.find(
      (s) => s.name === service,
    );
  const folders = () => value<List>("shareMgmtGetList", ALL).data;
  /** Save a new job (through the form schema) and answer its UUID. */
  const makeJob = (over: Row = {}) => {
    const answer = ask("rsyncSet", sent(F.RsyncSetRequestSchema, newJob(over)));
    expect(answer.status).toBe(200);
    return (answer.value as { uuid: string }).uuid;
  };
  /** Rsync.get's reply sent back as the change flow does (0.11), with these fields changed. */
  const jobBack = (uuid: string, change: Row = {}) => {
    const got = page<Row>("rsyncGet", { uuid });
    const {
      src: _src,
      dest: _dest,
      password: _password,
      ...rest
    } = got as Row & { src: unknown; dest: unknown };
    const remote = got.type === "remote";
    return sent(F.RsyncSetRequestSchema, {
      ...rest,
      srcsharedfolderref: got.srcsharedfolderref ?? "",
      srcuri: got.srcuri ?? "",
      destsharedfolderref: got.destsharedfolderref ?? "",
      desturi: got.desturi ?? "",
      password:
        remote && got.authentication === "password" ? EXAMPLE_PASSWORD : "",
      ...change,
    });
  };
  const start = (uuid: string) => {
    const answer = ask("rsyncExecute", { uuid });
    expect(answer.status, JSON.stringify(answer)).toBe(200);
    return answer.value as string;
  };
  return {
    session,
    raw,
    ask,
    value,
    page,
    failure,
    pending,
    apply,
    undo,
    follow,
    jobs,
    nfsShares,
    modules,
    status,
    folders,
    makeJob,
    jobBack,
    start,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the services stories of the mock", () => {
  it.each(SERVICES_SCENARIOS)(
    "%s: every read has the contract's shape, and each row reads alone",
    (scenario) => {
      const s = story(scenario);
      for (const operationId of [
        "shareMgmtGetList",
        "servicesGetStatus",
        "systemGetInformation",
        "systemGetTimeSettings",
        "emailNotificationGet",
        "configIsDirty",
        "nfsGetSettings",
        "nfsGetStats",
        "nfsGetShareList",
        "rsyncdGetSettings",
        "rsyncdGetModuleList",
        "rsyncGetList",
        "smbGetSettings",
        "smbGetShareList",
        "certificateMgmtGetSshList",
        "userMgmtGetUserList",
        "userMgmtGetGroupList",
        "fileSystemMgmtGetList",
      ]) {
        s.ask(operationId, ALL);
      }
      if (scenario !== "jobsBroken") {
        for (const j of s.jobs()) {
          s.value("rsyncGet", { uuid: j.uuid });
        }
      }
      for (const n of s.nfsShares()) {
        s.value("nfsGetShare", { uuid: n.uuid });
      }
      for (const m of s.modules()) {
        s.value("rsyncdGetModule", { uuid: m.uuid });
      }
      for (const share of s.value<List>("smbGetShareList", ALL).data) {
        const got = s.value<Row>("smbGetShare", { uuid: share.uuid });
        expect(got).not.toHaveProperty("sharedfoldername");
      }
    },
  );

  it("servicesNone: everything off and empty, no SSH key, no email", () => {
    const s = story("servicesNone");
    expect(s.value<Row>("nfsGetSettings")).toEqual(
      CONTRACT_EXAMPLES.nfsGetSettings.off.value,
    );
    expect(s.value<Row>("rsyncdGetSettings")).toEqual(
      CONTRACT_EXAMPLES.rsyncdGetSettings.off.value,
    );
    expect(s.nfsShares()).toEqual([]);
    expect(s.modules()).toEqual([]);
    expect(s.jobs()).toEqual([]);
    expect(s.value<List>("certificateMgmtGetSshList", ALL).total).toBe(0);
    expect(s.value<Row>("emailNotificationGet")).toEqual(
      CONTRACT_EXAMPLES.emailNotificationGet.notConfigured.value,
    );
    expect(s.value("nfsGetStats")).toBe("Service disabled");
    expect(s.pending()).toEqual([]);
  });

  describe("servicesSome", () => {
    it("holds the design's entries, folders offered and jobs, with the captured examples' fields", () => {
      const s = story("servicesSome");
      const settings = s.value<{ shares: { share: Row[] } }>("nfsGetSettings");
      expect(keys(settings)).toEqual(
        keys(CONTRACT_EXAMPLES.nfsGetSettings.on.value),
      );
      expect(settings.shares.share).toHaveLength(3);
      expect(s.nfsShares().map((n) => n.client)).toEqual([
        "192.0.2.10",
        "192.0.2.0/24",
        "*",
      ]);
      expect(keys(s.nfsShares()[0])).toEqual(
        keys(CONTRACT_EXAMPLES.nfsGetShareList.several.value.data[0]),
      );
      expect(
        keys(s.value("nfsGetShare", { uuid: s.nfsShares()[0]?.uuid })),
      ).toEqual(keys(CONTRACT_EXAMPLES.nfsGetShare.one.value));
      expect(s.modules().map((m) => [m.name, m.authusers])).toEqual([
        ["media", false],
        ["photos", true],
      ]);
      const [local, push, pull] = s.jobs();
      expect([local?.type, push?.mode, pull?.mode]).toEqual([
        "local",
        "push",
        "pull",
      ]);
      expect(keys(local)).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncGetList.several.value.data[0]),
      );
      expect(push?.destname).toBe(
        "backup@backup.example.org:/srv/copies/photos/",
      );
      expect([local?.srcname, local?.destname]).toEqual(["Media", "Backup"]);
      expect(keys(s.value("rsyncGet", { uuid: SERVICES_JOBS.local }))).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncGet.local.value),
      );
      expect(keys(s.value("rsyncGet", { uuid: SERVICES_JOBS.push }))).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncGet.pushSsh.value),
      );
      expect(keys(s.value("rsyncGet", { uuid: SERVICES_JOBS.pull }))).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncGet.pullRsyncd.value),
      );
      expect(
        keys(s.value("smbGetShare", { uuid: SERVICES_SHARES.photos })),
      ).toEqual(keys(CONTRACT_EXAMPLES.smbGetShare.stock.value));
      const key = s.value<List>("certificateMgmtGetSshList", ALL).data[0];
      expect(keys(key)).toEqual(
        keys(CONTRACT_EXAMPLES.certificateMgmtGetSshList.one.value.data[0]),
      );
      expect(key).toMatchObject({ uuid: SERVICES_KEY, _used: true });
      expect(s.status("nfs")).toMatchObject({ enabled: true, running: true });
      expect(s.status("rsyncd")).toMatchObject({
        enabled: true,
        running: true,
      });
      expect(s.value<Row>("emailNotificationGet")).toEqual(
        CONTRACT_EXAMPLES.emailNotificationGet.configured.value,
      );
    });

    it("sends the stored passwords, which the transport turns into whether one is set", () => {
      const s = story("servicesSome");
      const pull = s.jobs().find((j) => j.uuid === SERVICES_JOBS.pull);
      expect(pull?.password).toBe(EXAMPLE_PASSWORD);
      expect(
        s.page<List>("rsyncGetList", ALL).data.map((j) => j.password),
      ).toEqual([false, false, true]);
      expect(
        s.value<Row>("rsyncGet", { uuid: SERVICES_JOBS.pull }).password,
      ).toBe(EXAMPLE_PASSWORD);
      expect(
        s.page<Row>("rsyncGet", { uuid: SERVICES_JOBS.pull }).password,
      ).toBe(true);
      const photos = s.modules().find((m) => m.name === "photos");
      expect(photos?.users).toEqual([
        { name: "copier", password: EXAMPLE_PASSWORD },
      ]);
      expect(
        s.page<List>("rsyncdGetModuleList", ALL).data.map((m) => m.users),
      ).toEqual([[], [{ name: "copier", password: true }]]);
      expect(
        s.page<Row>("rsyncdGetModule", { uuid: photos?.uuid }).users,
      ).toEqual([{ name: "copier", password: true }]);
    });

    it("marks each folder used by an entry, a folder offered or a job, and refuses to delete it", () => {
      const s = story("servicesSome");
      const used = Object.fromEntries(
        s.folders().map((f) => [f.name, f._used]),
      );
      expect(used).toMatchObject({
        Media: true,
        Backup: true,
        Photos: true,
        "Holiday Photos": false,
        Archive: false,
        Документы: false,
      });
      s.failure("shareMgmtDelete", { uuid: FOLDER.media, recursive: false });
      expect(s.folders().some((f) => f.uuid === FOLDER.media)).toBe(true);
    });
  });

  describe("NFS", () => {
    it("turning it off answers the versions as one string, marks avahi and nfs, and applies", () => {
      const s = story("servicesSome");
      const reply = s.value<Row>(
        "nfsSetSettings",
        sent(F.NfsSetSettingsRequestSchema, {
          enable: false,
          versions: ["3", "4", "4.1", "4.2"],
        }),
      );
      expect(reply).toEqual(CONTRACT_EXAMPLES.nfsSetSettings.turnedOff.value);
      expect(
        s.page("nfsSetSettings", { enable: false, versions: ["3"] }),
      ).toEqual({ enable: false, versions: "3" });
      expect(s.value<Row>("nfsGetSettings").enable).toBe(false);
      expect(s.pending()).toEqual(["avahi", "nfs"]);
      expect(s.status("nfs")).toMatchObject({ enabled: true, running: true });
      expect(s.failure("nfsGetStats").message).toBe(PENDING);
      expect(s.apply()).toBe("appliedFinished");
      expect(s.pending()).toEqual([]);
      expect(s.status("nfs")).toMatchObject({ enabled: false, running: false });
      expect(s.value("nfsGetStats")).toBe("Service disabled");
    });

    it("a folder's first entry makes its bind mount; a second, a change and the last removal mark what the VM showed", () => {
      const s = story("servicesSome");
      const entry = (client: string) =>
        sent(F.NfsSetShareRequestSchema, {
          uuid: NEW_OBJECT,
          sharedfolderref: FOLDER.photos,
          mntentref: NEW_OBJECT,
          client,
          options: "ro",
          extraoptions: "subtree_check,insecure",
          comment: "",
        });
      const first = s.value<Row>("nfsSetShare", entry("192.0.2.20"));
      expect(first.mntentref).not.toBe(NEW_OBJECT);
      expect(first.uuid).not.toBe(NEW_OBJECT);
      expect(keys(first)).toEqual(
        keys(CONTRACT_EXAMPLES.nfsSetShare.created.value),
      );
      expect(s.pending()).toEqual(MOUNT_MODULES);
      s.apply();
      const second = s.value<Row>("nfsSetShare", entry("192.0.2.0/24"));
      expect(second.mntentref).toBe(first.mntentref);
      expect(s.pending()).toEqual(["avahi", "nfs"]);
      s.apply();
      const got = s.value<Row>("nfsGetShare", { uuid: second.uuid });
      s.value(
        "nfsSetShare",
        sent(F.NfsSetShareRequestSchema, { ...got, options: "rw" }),
      );
      expect(s.pending()).toEqual(["nfs"]);
      expect(s.value<Row>("nfsGetShare", { uuid: second.uuid }).options).toBe(
        "rw",
      );
      s.apply();
      expect(s.value("nfsDeleteShare", { uuid: second.uuid })).toEqual(
        CONTRACT_EXAMPLES.nfsDeleteShare.removed.value,
      );
      expect(s.pending()).toEqual(["avahi", "nfs"]);
      s.apply();
      s.value("nfsDeleteShare", { uuid: first.uuid });
      expect(s.pending()).toEqual(MOUNT_MODULES);
      expect(
        s.nfsShares().filter((n) => n.sharedfolderref === FOLDER.photos),
      ).toEqual([]);
    });

    it("refuses a folder whose path has a blank, and empty extra options, in OMV's words", () => {
      const s = story("servicesSome");
      const base = {
        uuid: NEW_OBJECT,
        sharedfolderref: FOLDER.holiday,
        mntentref: NEW_OBJECT,
        client: "192.0.2.10",
        options: "ro",
        extraoptions: "subtree_check,insecure",
        comment: "",
      };
      expect(s.failure("nfsSetShare", base).message).toBe(
        "The relative path of the shared folder 'Holiday Photos' contains blanks.",
      );
      expect(
        s.failure("nfsSetShare", {
          ...base,
          sharedfolderref: FOLDER.photos,
          extraoptions: "",
        }).message,
      ).toBe(CONTRACT_EXAMPLES.nfsSetShare.emptyExtraOptions.value.message);
      expect(s.pending()).toEqual([]);
    });

    it("an undo brings back the entries as last applied", () => {
      const s = story("servicesSome");
      const before = s.nfsShares();
      s.value("nfsDeleteShare", { uuid: before[0]?.uuid });
      expect(s.nfsShares()).toHaveLength(2);
      s.undo();
      expect(s.nfsShares()).toEqual(before);
      expect(s.pending()).toEqual([]);
    });
  });

  describe("the rsync server", () => {
    it("turning it off marks avahi and rsyncd", () => {
      const s = story("servicesSome");
      expect(
        s.value(
          "rsyncdSetSettings",
          sent(F.RsyncdSetSettingsRequestSchema, {
            enable: false,
            port: 873,
            extraoptions: "",
          }),
        ),
      ).toEqual(CONTRACT_EXAMPLES.rsyncdSetSettings.turnedOff.value);
      expect(s.pending()).toEqual(["avahi", "rsyncd"]);
      s.apply();
      expect(s.status("rsyncd")).toMatchObject({ enabled: false });
    });

    it("offers a folder with a sign-in, answers the stored shape, refuses the name twice, removes it", () => {
      const s = story("servicesSome");
      const offer = sent(F.RsyncdSetModuleRequestSchema, {
        uuid: NEW_OBJECT,
        enable: true,
        sharedfolderref: FOLDER.documents,
        name: "documents",
        comment: "",
        uid: "nobody",
        gid: "users",
        readonly: true,
        writeonly: false,
        maxconnections: 0,
        list: true,
        hostsallow: "",
        hostsdeny: "",
        authusers: true,
        usechroot: true,
        users: [{ name: "copier", password: EXAMPLE_PASSWORD }],
        extraoptions: "",
      });
      const made = s.value<Row & { users: { user: Row[] } }>(
        "rsyncdSetModule",
        offer,
      );
      expect(keys(made)).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncdSetModule.created.value),
      );
      expect(made.users.user).toEqual([
        { name: "copier", password: EXAMPLE_PASSWORD },
      ]);
      expect(
        s.page<Row>("rsyncdSetModule", { ...offer, name: "other" }).users,
      ).toEqual({ user: [{ name: "copier" }] });
      expect(s.pending()).toEqual(["rsyncd"]);
      expect(s.failure("rsyncdSetModule", offer).message).toBe(
        "The configuration object 'conf.service.rsyncd.module' is not unique. An object with the property 'name' and value 'documents' already exists.",
      );
      const removed = s.value<Row>("rsyncdDeleteModule", { uuid: made.uuid });
      expect(keys(removed)).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncdDeleteModule.removed.value),
      );
      expect(s.modules().map((m) => m.name)).toEqual([
        "media",
        "photos",
        "other",
      ]);
    });

    it("modulesMany: a folder with three sign-ins, each password replaced by whether it is set", () => {
      const s = story("modulesMany");
      const archive = s
        .page<List>("rsyncdGetModuleList", ALL)
        .data.find((m) => m.name === "archive");
      expect(archive?.users).toEqual([
        { name: "alex", password: true },
        { name: "robin", password: true },
        { name: "sam", password: true },
      ]);
    });
  });

  describe("copy jobs", () => {
    it("a new job reads back as saved, through get (lists) and getList (text), and marks rsync", () => {
      const s = story("servicesSome");
      const uuid = s.makeJob({
        comment: "Photos to Backup",
        hour: ["1", "13"],
      });
      const row = s.jobs().find((j) => j.uuid === uuid);
      expect(row).toMatchObject({
        hour: "1,13",
        srcname: "Photos",
        destname: "Backup",
        optiondryrun: true,
        enable: false,
      });
      const got = s.value<Row>("rsyncGet", { uuid });
      expect(got).toMatchObject({
        hour: ["1", "13"],
        srcsharedfolderref: FOLDER.photos,
        destsharedfolderref: FOLDER.backup,
      });
      expect(got).not.toHaveProperty("srcuri");
      expect(s.pending()).toEqual(["rsync"]);
    });

    it("keeps only the side fields that apply, and the stored password of a pull", () => {
      const s = story("servicesSome");
      const reply = s.value<Row>(
        "rsyncSet",
        sent(
          F.RsyncSetRequestSchema,
          newJob({
            type: "remote",
            mode: "pull",
            srcsharedfolderref: "",
            srcuri: "rsync://copier@backup.example.org/photos/",
            password: EXAMPLE_PASSWORD,
          }),
        ),
      );
      expect(keys(reply)).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncSet.created.value),
      );
      expect(reply).toMatchObject({
        src: {
          sharedfolderref: "",
          uri: "rsync://copier@backup.example.org/photos/",
        },
        dest: { sharedfolderref: FOLDER.backup, uri: "" },
        password: EXAMPLE_PASSWORD,
        minute: "0",
      });
      expect(s.page<Row>("rsyncSet", newJob())).not.toHaveProperty("password");
      const got = s.value<Row>("rsyncGet", { uuid: reply.uuid });
      expect(got).toMatchObject({
        srcuri: "rsync://copier@backup.example.org/photos/",
        destsharedfolderref: FOLDER.backup,
      });
      expect(got).not.toHaveProperty("srcsharedfolderref");
    });

    it("a change and a delete read back; the delete answers the stored job, its password removed by the transport", () => {
      const s = story("servicesSome");
      s.value(
        "rsyncSet",
        s.jobBack(SERVICES_JOBS.local, { comment: "Media into Backup" }),
      );
      expect(
        s.value<Row>("rsyncGet", { uuid: SERVICES_JOBS.local }).comment,
      ).toBe("Media into Backup");
      const removed = s.value<Row>("rsyncDelete", { uuid: SERVICES_JOBS.pull });
      expect(keys(removed)).toEqual(
        keys(CONTRACT_EXAMPLES.rsyncDelete.deleted.value),
      );
      expect(removed.password).toBe(EXAMPLE_PASSWORD);
      expect(s.jobs().map((j) => j.uuid)).toEqual([
        SERVICES_JOBS.local,
        SERVICES_JOBS.push,
      ]);
      expect(s.pending()).toEqual(["rsync"]);
      s.undo();
      expect(s.jobs()).toHaveLength(3);
    });

    it("Run now is refused while rsync is pending, and runs the job as last applied once applied", () => {
      const s = story("servicesSome");
      s.value(
        "rsyncSet",
        s.jobBack(SERVICES_JOBS.local, {
          optiondelete: true,
          optiondryrun: true,
        }),
      );
      expect(
        s.failure("rsyncExecute", { uuid: SERVICES_JOBS.local }).message,
      ).toBe(CONTRACT_EXAMPLES.rsyncExecute.pending.value.message);
      s.apply();
      const run = s.follow(s.start(SERVICES_JOBS.local));
      expect(run.error).toBeUndefined();
      expect(run.polls).toBeGreaterThan(1);
      expect(run.output).toMatch(
        /^Please wait, syncing <\/srv\/.+\/Media\/> to <\/srv\/.+\/Backup\/> \.\.\.\n\nsending incremental file list\n/,
      );
      expect(run.output.match(/^deleting /gm)).toHaveLength(5);
      expect(run.output).toContain("(DRY RUN)");
      expect(
        run.output.endsWith(
          "The synchronisation has completed successfully.\n",
        ),
      ).toBe(true);
      // The handle is gone after the last poll.
      expect(
        s.failure("execGetOutput", {
          filename: "/tmp/bgstatusSvcTask000001",
          pos: 0,
        }).message,
      ).toBe(
        "Failed to open file (filename=/tmp/bgstatusSvcTask000001, mode=r).",
      );
    });

    it("a job on a file system that is not mounted fails at once in the script's words", () => {
      const s = story("servicesSome");
      const uuid = s.makeJob({ srcsharedfolderref: FOLDER.archive });
      s.apply();
      const run = s.follow(s.start(uuid));
      expect(run.output).toMatch(
        /^\[ERROR\] Source storage device not mounted at <\/srv\/[^>]+\/>!\n$/,
      );
      expect(run.error).toMatch(
        /with exit code '1': \[ERROR\] Source storage device not mounted at </,
      );
    });

    it("a second start while the job runs ends at once with a failure and no output", () => {
      const s = story("jobsRun");
      const first = s.start(SERVICES_JOBS.long);
      s.ask("execGetOutput", { filename: first, pos: 0 });
      const second = s.follow(s.start(SERVICES_JOBS.long));
      expect(second).toMatchObject({ output: "", polls: 1 });
      expect(second.error).toBe(
        CONTRACT_EXAMPLES.execGetOutput.rsyncSecondStartFailed.value.message.replace(
          /rsync-[0-9a-f-]+/,
          `rsync-${SERVICES_JOBS.long}`,
        ),
      );
    });
  });

  describe("jobsRun", () => {
    it("Run now succeeds with 30,000 lines in many chunks", () => {
      const s = story("jobsRun");
      const run = s.follow(s.start(SERVICES_JOBS.big));
      expect(run.error).toBeUndefined();
      expect(run.output.split("\n").length - 1).toBe(30_000);
      expect(run.polls).toBeGreaterThanOrEqual(20);
    });

    it("fails with Host key verification failed, in the captured shape", () => {
      const s = story("jobsRun");
      const run = s.follow(s.start(SERVICES_JOBS.hostKey));
      expect(run.output).toContain("Host key verification failed.\n");
      expect(run.output.endsWith("[ERROR] The synchronisation failed.\n")).toBe(
        true,
      );
      expect(run.error).toContain(
        "with exit code '255': Please wait, syncing <",
      );
      expect(run.error?.endsWith("[ERROR] The synchronisation failed.")).toBe(
        true,
      );
    });

    it("fails at once with no output", () => {
      const s = story("jobsRun");
      const run = s.follow(s.start(SERVICES_JOBS.atOnce));
      expect(run).toMatchObject({ output: "", polls: 1 });
      expect(run.error).toMatch(/with exit code '1': $/);
    });

    it("the long one writes, then runs until it is stopped; its handle is then gone", () => {
      const s = story("jobsRun");
      const handle = s.start(SERVICES_JOBS.long);
      const part = s.follow(handle, 10);
      expect(part.stillRunning).toBe(true);
      expect(part.output).toContain("films/0399.mkv\n");
      expect(part.output).not.toContain("completed successfully");
      expect(s.value("execIsRunning", { filename: handle })).toEqual({
        filename: handle,
        running: true,
      });
      expect(s.value("execStop", { filename: handle })).toBeNull();
      expect(
        s.failure("execGetOutput", { filename: handle, pos: 0 }).message,
      ).toBe(`Failed to open file (filename=${handle}, mode=r).`);
      expect(s.value("execIsRunning", { filename: handle })).toEqual({
        filename: handle,
        running: false,
      });
      // Not stopped, it finishes by itself after HOLD_POLLS polls.
      const alone = s.follow(s.start(SERVICES_JOBS.long), HOLD_POLLS + 100);
      expect(alone.output).toContain("completed successfully");
    });
  });

  describe("jobsTrial", () => {
    const trial = (dest: string, over: Row = {}) => {
      const s = story("jobsTrial");
      const uuid = s.makeJob({
        destsharedfolderref: dest,
        optiondelete: true,
        ...over,
      });
      s.apply();
      return { s, uuid, run: s.follow(s.start(uuid)) };
    };

    it("into Backup lists 12 deletions", () => {
      const { run } = trial(FOLDER.backup);
      expect(run.error).toBeUndefined();
      expect(run.output.match(/^deleting /gm)).toHaveLength(12);
      expect(run.output).toContain("(DRY RUN)");
    });

    it("into Media lists none", () => {
      const { run } = trial(FOLDER.media);
      expect(run.error).toBeUndefined();
      expect(run.output).not.toMatch(/^deleting /m);
    });

    it("anywhere else fails: a folder with Permission denied, over SSH with the host key", () => {
      expect(trial(FOLDER.documents).run.error).toContain(
        "Permission denied (13)",
      );
      const { run } = trial("", {
        type: "remote",
        mode: "push",
        desturi: "backup@backup.example.org:/srv/copies/",
        authentication: "pubkey",
        sshcertificateref: SERVICES_KEY,
      });
      expect(run.error).toContain("Host key verification failed.");
    });

    it("a trial of a job that does not delete lists no deletions, even into Backup", () => {
      const { run } = trial(FOLDER.backup, { optiondelete: false });
      expect(run.output).not.toMatch(/^deleting /m);
    });
  });

  it("jobsPending: rsync pending, Run now refused, an undo brings the job back", () => {
    const s = story("jobsPending");
    expect(s.pending()).toEqual(["rsync"]);
    expect(
      s.value<Row>("rsyncGet", { uuid: SERVICES_JOBS.local }).hour,
    ).toEqual(["4"]);
    expect(
      s.failure("rsyncExecute", { uuid: SERVICES_JOBS.push }).message,
    ).toBe(PENDING);
    s.undo();
    expect(s.pending()).toEqual([]);
    expect(
      s.value<Row>("rsyncGet", { uuid: SERVICES_JOBS.local }).hour,
    ).toEqual(["3"]);
    s.start(SERVICES_JOBS.push);
  });

  it("jobsMany: 1,000 jobs and 400 NFS entries over 200 folders", () => {
    const s = story("jobsMany");
    expect(s.value<List>("rsyncGetList", ALL).total).toBe(1000);
    const entries = s.nfsShares();
    expect(entries).toHaveLength(400);
    expect(new Set(entries.map((e) => e.sharedfolderref)).size).toBe(200);
    expect(
      s.value<List>("rsyncGetList", { ...ALL, start: 50, limit: 25 }).data,
    ).toHaveLength(25);
  });

  it("jobsBroken: the list fails as when a job's shared folder is gone", () => {
    const s = story("jobsBroken");
    expect(s.failure("rsyncGetList", ALL).message).toBe(
      CONTRACT_EXAMPLES.rsyncGetList.folderGone.value.message.replace(
        /[0-9a-f]{8}-[0-9a-f-]{27}/,
        GONE_FOLDER,
      ),
    );
    s.value("nfsGetShareList", ALL);
  });

  it("servicesDown: NFS and the rsync server on but not running", () => {
    const s = story("servicesDown");
    expect(s.status("nfs")).toMatchObject({ enabled: true, running: false });
    expect(s.status("rsyncd")).toMatchObject({ enabled: true, running: false });
  });

  it("servicesRoot: an entry with no_root_squash and classic values", () => {
    const s = story("servicesRoot");
    expect(s.nfsShares().map((n) => [n.client, n.extraoptions])).toEqual([
      ["192.0.2.10", "no_root_squash,subtree_check,insecure"],
      ["*.example.org", "all_squash,anonuid=1000,anongid=100,sync"],
      ["2001:db8::/32", "subtree_check,insecure"],
    ]);
  });

  it("jobsDeleting and jobsCustomSchedule hold their jobs", () => {
    const deleting = story("jobsDeleting").jobs();
    expect(
      deleting.map((j) => [j.optiondelete, j.optiondryrun, j.extraoptions]),
    ).toEqual([
      [true, false, ""],
      [false, false, "--delete-after --exclude=.recycle"],
      [false, false, "--remove-source-files"],
      [true, true, ""],
    ]);
    const custom = story("jobsCustomSchedule").jobs();
    expect(
      custom.map((j) => [
        j.minute,
        j.hour,
        j.dayofweek,
        j.everynhour,
        j.everynminute,
        j.enable,
      ]),
    ).toEqual([
      ["0,30", "1,13", "1,3,5", false, false, true],
      ["15", "6", "*", true, false, true],
      ["10", "*", "*", false, true, true],
      ["30", "4", "7", false, false, true],
      ["0", "3", "*", false, false, false],
      ["5", "2", "1", false, false, true],
    ]);
  });

  it("servicesNoSshList: the SSH keys cannot be read", () => {
    const s = story("servicesNoSshList");
    expect(s.failure("certificateMgmtGetSshList", ALL).message).toEqual(
      expect.any(String),
    );
    expect(s.jobs()).toHaveLength(3);
  });

  it("servicesHostile: names, notes and hosts of 200 characters, markup, right-to-left, and output with controls", () => {
    const s = story("servicesHostile");
    const names = s.folders().map((f) => String(f.name));
    expect(names).toEqual(
      expect.arrayContaining(["<b>x</b>", "תמונות", "‮evil.exe"]),
    );
    expect(names.some((n) => n.length === 200)).toBe(true);
    expect(s.jobs().some((j) => String(j.comment).length === 200)).toBe(true);
    expect(s.modules().some((m) => String(m.name).length === 200)).toBe(true);
    expect(
      s
        .jobs()
        .some((j) =>
          /@a{63}\.b{63}\.c{60}\.example\.org:/.test(String(j.destname)),
        ),
    ).toBe(true);
    const local = s.jobs().find((j) => j.type === "local");
    const run = s.follow(s.start(String(local?.uuid)));
    expect(run.output).toContain("\u001b[1;31m");
    expect(run.output).toContain("‮");
  });

  describe("recycleBin", () => {
    it("holds a 30-day bin, one kept until emptied and one off", () => {
      const s = story("recycleBin");
      const bins = [
        SERVICES_SHARES.photos,
        SERVICES_SHARES.media,
        SERVICES_SHARES.backup,
      ].map((uuid) => {
        const share = s.value<Row>("smbGetShare", { uuid });
        return [share.recyclebin, share.recyclemaxage];
      });
      expect(bins).toEqual([
        [true, 30],
        [true, 0],
        [false, 0],
      ]);
      expect(
        keys(s.value("smbGetShare", { uuid: SERVICES_SHARES.photos })),
      ).toEqual(keys(CONTRACT_EXAMPLES.smbGetShare.recycleOn.value));
    });

    it("emptying writes the script's line and rm's; an empty bin only the first; a bin off fails", () => {
      const s = story("recycleBin");
      const empty = (uuid: string) => {
        const answer = s.ask("smbEmptyRecycleBin", { uuid });
        expect(answer.status).toBe(200);
        return s.follow(answer.value as string);
      };
      const photos = empty(SERVICES_SHARES.photos);
      expect(photos.error).toBeUndefined();
      expect(photos.output).toMatch(
        /^Please wait, empty recyle bin of <\/srv\/.+\/Photos\/> \.\.\.\nremoved '/,
      );
      expect(photos.polls).toBeGreaterThan(1);
      const media = empty(SERVICES_SHARES.media);
      expect(media.output).toMatch(
        /^Please wait, empty recyle bin of <[^>]+\/Media\/> \.\.\.\n$/,
      );
      const backup = empty(SERVICES_SHARES.backup);
      expect(backup.error).toMatch(
        /with exit code '127': \/bin\/sh: 1: \/var\/lib\/openmediavault\/cron\.d\/samba-recycle-[0-9a-f-]+: not found$/,
      );
    });

    it("a workgroup saved makes samba pending, and emptying is then refused; a bad workgroup is refused", () => {
      const s = story("recycleBin");
      const settings = s.value<Row>("smbGetSettings");
      expect(
        s.failure("smbSetSettings", {
          ...settings,
          workgroup: "WORKGROUP-SIXTEE",
        }).message,
      ).toBe(CONTRACT_EXAMPLES.smbSetSettings.badWorkgroup.value.message);
      expect(s.pending()).toEqual([]);
      s.value("smbSetSettings", { ...settings, workgroup: "HOME" });
      expect(s.value<Row>("smbGetSettings").workgroup).toBe("HOME");
      expect(s.pending()).toEqual(["avahi", "samba"]);
      expect(
        s.failure("smbEmptyRecycleBin", { uuid: SERVICES_SHARES.photos })
          .message,
      ).toBe(CONTRACT_EXAMPLES.smbEmptyRecycleBin.pending.value.message);
      s.apply();
      s.ask("smbEmptyRecycleBin", { uuid: SERVICES_SHARES.photos });
    });

    it("a share's recycle bin turned on through setShare reads back from getShare", () => {
      const s = story("recycleBin");
      const share = s.value<Row>("smbGetShare", {
        uuid: SERVICES_SHARES.backup,
      });
      s.value(
        "smbSetShare",
        sent(F.SmbSetShareRequestSchema, {
          ...share,
          recyclebin: true,
          recyclemaxage: 7,
        }),
      );
      expect(
        s.value<Row>("smbGetShare", { uuid: SERVICES_SHARES.backup }),
      ).toMatchObject({
        recyclebin: true,
        recyclemaxage: 7,
      });
      expect(s.pending()).toEqual(["avahi", "samba"]);
    });
  });

  describe("the add flow's failures (design 5.8)", () => {
    it.each([
      { name: "jobsAddFails", k: 0, want: "save" },
      { name: "jobsAddFails", k: 5, want: "cut" },
      { name: "jobsAddFails", k: 6, want: "save" },
      { name: "jobsAddFailsSave", k: 0, want: "save" },
      { name: "jobsAddFailsSave", k: 1, want: null },
      { name: "jobsAddFailsTrial", k: 3, want: "trial" },
      { name: "jobsAddFailsCheck", k: 0, want: null },
      { name: "servicesSome", k: 0, want: null },
    ] as const)("$name, new job $k: $want", ({ name, k, want }) => {
      expect(jobsAddFailureOf(name, k)).toBe(want);
    });

    /** The add flow's steps: save for trials, apply, trial, save turned on, apply (5.6, 5.7). */
    const walk = (name: ScenarioName) => {
      const s = story(name);
      const steps: string[] = [];
      let uuid: string | undefined;
      for (let tries = 0; uuid === undefined && tries < 3; tries++) {
        const answer = s.ask(
          "rsyncSet",
          sent(F.RsyncSetRequestSchema, newJob({ optiondelete: true })),
        );
        if (answer.status === 200) {
          uuid = (answer.value as { uuid: string }).uuid;
        } else {
          steps.push(`save: ${String(answer.status)}`);
          // A cut request: the job was saved all the same.
          uuid = s.jobs().find((j) => j.optiondelete === true)?.uuid as
            string | undefined;
        }
      }
      const retry = (label: string, step: () => boolean) => {
        if (!step()) {
          steps.push(`${label}: failed`);
          expect(step(), `${label} again`).toBe(true);
        }
      };
      retry("apply", () => s.apply() === "appliedFinished");
      retry("trial", () => s.follow(s.start(String(uuid))).error === undefined);
      retry(
        "turnOn",
        () =>
          s.ask(
            "rsyncSet",
            s.jobBack(String(uuid), { optiondryrun: false, enable: true }),
          ).status === 200,
      );
      retry("apply turned on", () => s.apply() === "appliedFinished");
      expect(s.value<Row>("rsyncGet", { uuid })).toMatchObject({
        optiondryrun: false,
        enable: true,
      });
      return steps;
    };

    it.each([
      { name: "servicesSome", steps: [] },
      { name: "jobsAddFailsSave", steps: ["save: 500"] },
      { name: "jobsAddFailsApply", steps: ["apply: failed"] },
      { name: "jobsAddFailsTrial", steps: ["trial: failed"] },
      { name: "jobsAddFailsTurnOn", steps: ["turnOn: failed"] },
      { name: "jobsAddFailsTurnOnApply", steps: ["apply turned on: failed"] },
      { name: "jobsAddFailsCut", steps: ["save: 504"] },
    ] as const)("$name fails at $steps, once", ({ name, steps }) => {
      expect(walk(name)).toEqual(steps);
    });

    it("jobsAddFails: each new job meets the next failure in turn", () => {
      expect(JOBS_ADD_FAILURES_IN_TURN).toEqual([
        "save",
        "apply",
        "trial",
        "turnOnSave",
        "turnOnApply",
        "cut",
      ]);
      const s = story("jobsAddFails");
      expect(s.ask("rsyncSet", newJob()).status).toBe(500);
      s.makeJob();
      expect(s.apply()).toBe("applyFailed");
      expect(s.apply()).toBe("appliedFinished");
    });

    it("jobsAddFailsCheck: another change becomes pending once, 5 s after the folders were read", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
      const s = story("jobsAddFailsCheck");
      s.folders();
      expect(s.pending()).toEqual([]);
      vi.setSystemTime(Date.now() + CHECK_FAILS_AFTER_MS);
      expect(s.pending()).toEqual(["avahi", "samba"]);
      expect(s.raw("configIsDirty")).toBe("dirty");
      s.undo();
      vi.setSystemTime(Date.now() + CHECK_FAILS_AFTER_MS);
      expect(s.pending()).toEqual([]);
    });
  });

  it("outside the services stories, a write answers its example and marks what the VM showed", () => {
    const s = story("admin");
    expect(s.raw("nfsSetShare", {})).toBe("created");
    expect(s.pending()).toEqual(MOUNT_MODULES);
    expect(s.raw("rsyncExecute", {})).toBe("started");
    expect(
      s.raw("execGetOutput", {
        filename: CONTRACT_EXAMPLES.rsyncExecute.started.value,
        pos: 0,
      }),
    ).toBe("rsyncRunFinished");
    expect(s.raw("nfsGetSettings", {})).toBe("off");
  });
});
