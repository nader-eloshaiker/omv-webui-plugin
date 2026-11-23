// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job read, checked and written (phase 5 services design 0.6, 0.10, 0.11, 5.3, section 6), on
// the contract's captured jobs.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { RsyncSetRequestSchema } from "@omv-webui/react-api-omv/forms";
import type {
  RsyncJob,
  RsyncJobRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { defaultScheduleValue } from "@omv-webui/react-ui-components";
import { describe, expect, it } from "vitest";
import {
  changeNeed,
  choicesFromJob,
  copiesFolderItself,
  deletionOf,
  directionOf,
  emptyRemote,
  extraOptionFacts,
  fitsRemoteUri,
  isHost,
  isJobAddress,
  jobRefusals,
  jobRequest,
  NEW_JOB_UUID,
  otherOptionsSet,
  parseRemoteUri,
  remoteProblems,
  remoteUri,
  remoteWords,
  rowSides,
  sidesOf,
  trialKey,
  trialOnly,
  type JobChoices,
  type RemoteChoice,
} from "./jobModel.ts";

// The transport's presence replacement turns `password` into a boolean before the app sees it.
const asRead = <T extends { password?: unknown }>(raw: T) =>
  ({ ...raw, password: raw.password !== "" }) as unknown;
const LOCAL = asRead(CONTRACT_EXAMPLES.rsyncGet.local.value) as RsyncJob;
const PUSH = asRead(CONTRACT_EXAMPLES.rsyncGet.pushSsh.value) as RsyncJob;
const PULL = asRead(CONTRACT_EXAMPLES.rsyncGet.pullRsyncd.value) as RsyncJob;
const ROWS = (
  CONTRACT_EXAMPLES.rsyncGetList.several.value.data as readonly {
    password?: unknown;
  }[]
).map((r) => asRead(r) as RsyncJobRow);

const MEDIA = "00000000-0000-4000-8000-000000000002";
const BACKUP = "00000000-0000-4000-8000-000000000006";
const PULLED = "00000000-0000-4000-8000-000000000014";
const KEY = "00000000-0000-4000-8000-000000000012";

const validate = (request: unknown) => {
  const result = RsyncSetRequestSchema["~standard"].validate(request);
  if (result instanceof Promise) {
    throw new Error("async");
  }
  return result.issues;
};

describe("direction and sides", () => {
  it.each([
    [{ type: "local", mode: "push" }, "local"],
    [{ type: "local", mode: "pull" }, "local"],
    [{ type: "remote", mode: "push" }, "push"],
    [{ type: "remote", mode: "pull" }, "pull"],
    [{ type: "remote", mode: "both" }, null],
    [{ type: "other", mode: "push" }, null],
  ])("%o is %s", (job, direction) => {
    expect(directionOf(job)).toBe(direction);
  });

  it("reads both sides from Rsync.get, for each direction", () => {
    expect(sidesOf(LOCAL)).toEqual({
      direction: "local",
      from: { kind: "folder", uuid: MEDIA },
      to: { kind: "folder", uuid: BACKUP },
    });
    expect(sidesOf(PUSH)).toEqual({
      direction: "push",
      from: { kind: "folder", uuid: MEDIA },
      to: {
        kind: "remote",
        uri: "alex@backup.example.org:/srv/dev-disk-by-uuid-00000000-0000-4000-8000-00000000000e/Copies/",
      },
    });
    expect(sidesOf(PULL)).toEqual({
      direction: "pull",
      from: {
        kind: "remote",
        uri: "rsync://copier@backup.example.org/photos/",
      },
      to: { kind: "folder", uuid: PULLED },
    });
  });

  it("reads a getList row's sides with their names", () => {
    expect(ROWS.map((r) => rowSides(r))).toMatchObject([
      { direction: "local", fromName: "Media", toName: "Backup" },
      { direction: "push", fromName: "Media", to: { kind: "remote" } },
      { direction: "pull", toName: "Pulled", from: { kind: "remote" } },
    ]);
  });

  it("takes the flattened fields when src and dest are empty", () => {
    expect(
      sidesOf({
        type: "remote",
        mode: "pull",
        src: {},
        dest: {},
        srcuri: "rsync://backup.example.org/photos/",
        destsharedfolderref: PULLED,
      }),
    ).toMatchObject({
      from: { kind: "remote", uri: "rsync://backup.example.org/photos/" },
      to: { kind: "folder", uuid: PULLED },
    });
  });

  it("knows a job that copies the folder itself (a remote source without its trailing slash)", () => {
    const sides = sidesOf({
      ...PULL,
      src: { uri: "rsync://backup.example.org/photos" },
    });
    expect(sides && copiesFolderItself(sides)).toBe(true);
    const own = sidesOf(PULL);
    expect(own && copiesFolderItself(own)).toBe(false);
  });

  it("addresses a job's page by UUID only", () => {
    expect(isJobAddress(MEDIA)).toBe(true);
    expect(isJobAddress("add")).toBe(false);
    expect(isJobAddress("Rsync.delete")).toBe(false);
  });
});

describe("deletion and trial runs (0.6)", () => {
  it.each([
    ["", { deletes: false, removesSource: false, trial: false }],
    ["--delete-after", { deletes: true, removesSource: false, trial: false }],
    [
      "--delete-excluded --bwlimit=100",
      { deletes: true, removesSource: false, trial: false },
    ],
    ["--del", { deletes: true, removesSource: false, trial: false }],
    ["--delay-updates", { deletes: false, removesSource: false, trial: false }],
    [
      "--remove-source-files",
      { deletes: false, removesSource: true, trial: false },
    ],
    ["--dry-run", { deletes: false, removesSource: false, trial: true }],
    ["-n --delete", { deletes: true, removesSource: false, trial: true }],
    ["'--delete'", { deletes: true, removesSource: false, trial: false }],
  ])("extra options %j", (extra, facts) => {
    expect(extraOptionFacts(extra)).toEqual(facts);
  });

  it("treats a job that deletes through its extra options as one that deletes", () => {
    expect(deletionOf({ optiondelete: true, extraoptions: "" })).toBe("option");
    expect(
      deletionOf({ optiondelete: false, extraoptions: "--delete-during" }),
    ).toBe("extra");
    expect(deletionOf({ optiondelete: false, extraoptions: "" })).toBe("no");
  });

  it("is trial-only by its option or by -n / --dry-run in its extra options", () => {
    expect(trialOnly({ optiondryrun: true, extraoptions: "" })).toBe(true);
    expect(trialOnly({ optiondryrun: false, extraoptions: "-n" })).toBe(true);
    expect(trialOnly({ optiondryrun: false, extraoptions: "" })).toBe(false);
  });

  it("notices options set in the classic interface", () => {
    expect(otherOptionsSet(LOCAL)).toBe(false);
    expect(otherOptionsSet({ ...LOCAL, optioncompress: true })).toBe(true);
    expect(otherOptionsSet({ ...LOCAL, extraoptions: "--bwlimit=100" })).toBe(
      true,
    );
  });
});

describe("another computer's address (5.3)", () => {
  it.each([
    [
      {
        via: "ssh",
        user: "alex",
        host: "backup.example.org",
        path: "/srv/copies/photos",
      },
      "alex@backup.example.org:/srv/copies/photos/",
    ],
    [
      { via: "ssh", user: "alex", host: "2001:db8::20", path: "/srv/copies/" },
      "alex@[2001:db8::20]:/srv/copies/",
    ],
    [
      {
        via: "rsyncd",
        user: "",
        host: "192.0.2.20",
        port: null,
        module: "photos",
        inside: "",
      },
      "rsync://192.0.2.20/photos/",
    ],
    [
      {
        via: "rsyncd",
        user: "copier",
        host: "2001:db8::20",
        port: 8873,
        module: "photos",
        inside: "/2024/summer/",
      },
      "rsync://copier@[2001:db8::20]:8873/photos/2024/summer/",
    ],
    [
      {
        via: "rsyncd",
        user: "copier",
        host: "backup.example.org",
        port: 873,
        module: "photos",
        inside: "",
      },
      "rsync://copier@backup.example.org/photos/",
    ],
  ] as const)(
    "%o is written %s, which fits the contract and parses back",
    (address, uri) => {
      expect(remoteUri(address)).toBe(uri);
      expect(fitsRemoteUri(uri)).toBe(true);
      const parsed = parseRemoteUri(uri);
      expect(parsed?.trailing).toBe(true);
      expect(parsed && remoteUri(parsed.address)).toBe(uri);
    },
  );

  it("does not split an address set in the classic interface that the contract does not take", () => {
    for (const uri of [
      "backup.example.org::photos",
      "alex@backup.example.org:/srv/with space/",
      "rsync://backup.example.org/photos/../etc/",
      "/mnt/somewhere",
    ]) {
      expect(fitsRemoteUri(uri)).toBe(false);
      expect(parseRemoteUri(uri)).toBeNull();
    }
    // It is still said in words where it can be.
    expect(remoteWords("backup.example.org::photos")).toEqual({
      host: "backup.example.org",
      path: "photos",
    });
    expect(remoteWords("rsync://copier@backup.example.org/photos/")).toEqual({
      host: "backup.example.org",
      path: "photos",
    });
  });

  it("checks each field by 5.3's rules", () => {
    expect(
      ["192.0.2.20", "2001:db8::20", "backup.example.org", "nas"].map(isHost),
    ).toEqual([true, true, true, true]);
    expect(
      ["192.0.2.300", "*.example.org", "a b", "2001:db8:::1", ""].map(isHost),
    ).toEqual([false, false, false, false, false]);
    const ssh: RemoteChoice = {
      ...emptyRemote("ssh"),
      host: "backup.example.org",
      user: "Alex",
      path: "srv/copies",
    };
    expect(remoteProblems(ssh)).toEqual(["user", "path", "key"]);
    expect(
      remoteProblems({
        ...emptyRemote("rsyncd"),
        host: "backup.example.org",
        port: 70000,
        module: "my photos",
      }),
    ).toEqual(["port", "module"]);
  });
});

const folder = (
  uuid: string,
  name: string,
  reldirpath: string,
  mntentref = "m1",
) =>
  ({
    uuid,
    name,
    reldirpath,
    mntentref,
    status: "OK",
    mntent: { dir: "/srv/a" },
  }) as unknown as SharedFolder;
const FOLDERS = [
  folder(MEDIA, "Media", "Media/"),
  folder(BACKUP, "Backup", "Backup/"),
  folder("00000000-0000-4000-8000-000000000099", "Inner", "Media/inner/"),
  {
    ...folder("00000000-0000-4000-8000-000000000098", "Gone", "Gone/"),
    status: "ENOENT",
  },
];
const FS = [
  { mountpoint: "/srv/a", devicefile: "/dev/sdb1", mounted: true },
] as never[];

const choices = (over: Partial<JobChoices> = {}): JobChoices => ({
  from: { kind: "folder", uuid: MEDIA },
  to: { kind: "folder", uuid: BACKUP },
  deletes: false,
  schedule: defaultScheduleValue,
  sendemail: false,
  comment: "",
  ...over,
});
const sshTo = (over: Partial<RemoteChoice> = {}): JobChoices["to"] => ({
  kind: "remote",
  remote: {
    ...emptyRemote("ssh"),
    host: "backup.example.org",
    user: "alex",
    path: "/srv/copies",
    key: KEY,
    ...over,
  },
});

describe("the interface's refusals (0.10)", () => {
  it("lets a good job through", () => {
    expect(
      jobRefusals(choices(), { folders: FOLDERS, fileSystems: FS }),
    ).toEqual([]);
    expect(
      jobRefusals(choices({ to: sshTo() }), {
        folders: FOLDERS,
        fileSystems: FS,
      }),
    ).toEqual([]);
  });

  it("refuses the same folder, one inside the other, a missing side and two remote sides", () => {
    const reads = { folders: FOLDERS, fileSystems: FS };
    expect(
      jobRefusals(choices({ to: { kind: "folder", uuid: MEDIA } }), reads),
    ).toEqual([{ kind: "same" }]);
    expect(
      jobRefusals(
        choices({
          to: { kind: "folder", uuid: "00000000-0000-4000-8000-000000000099" },
        }),
        reads,
      ),
    ).toEqual([
      {
        kind: "inside",
        outer: MEDIA,
        inner: "00000000-0000-4000-8000-000000000099",
      },
    ]);
    expect(
      jobRefusals(choices({ to: { kind: "folder", uuid: "" } }), reads),
    ).toEqual([{ kind: "missing", side: "to" }]);
    expect(
      jobRefusals(choices({ from: sshTo(), to: sshTo() }), reads).map(
        (r) => r.kind,
      ),
    ).toContain("bothRemote");
  });

  it("refuses a folder that cannot be reached, only where asked to check it", () => {
    const reads = { folders: FOLDERS, fileSystems: FS };
    const gone = choices({
      to: { kind: "folder", uuid: "00000000-0000-4000-8000-000000000098" },
    });
    expect(jobRefusals(gone, reads)).toEqual([
      {
        kind: "folder",
        side: "to",
        uuid: "00000000-0000-4000-8000-000000000098",
        reason: "notOk",
      },
    ]);
    expect(jobRefusals(gone, reads, { from: true, to: false })).toEqual([]);
  });

  it("refuses a stored address that does not fit until it is written again", () => {
    const classic = choices({
      to: {
        kind: "remote",
        remote: {
          ...emptyRemote("rsyncd"),
          keep: "backup.example.org::photos",
        },
      },
    });
    expect(jobRefusals(classic, { folders: FOLDERS, fileSystems: FS })).toEqual(
      [{ kind: "classicAddress" }],
    );
  });

  it("refuses a note that is too long or has a line break", () => {
    const reads = { folders: FOLDERS, fileSystems: FS };
    expect(jobRefusals(choices({ comment: "x".repeat(201) }), reads)).toEqual([
      { kind: "note" },
    ]);
    expect(jobRefusals(choices({ comment: "a\nb" }), reads)).toEqual([
      { kind: "note" },
    ]);
  });
});

describe("the write: all 36 fields, one shape per direction (0.11)", () => {
  it("writes a new local job with the classic defaults, the unused sides empty", () => {
    const request = jobRequest({
      uuid: NEW_JOB_UUID,
      choices: choices({ comment: "Media into Backup" }),
      enable: false,
      dryrun: true,
      password: "",
    });
    expect(request).toEqual({
      uuid: NEW_JOB_UUID,
      enable: false,
      sendemail: false,
      comment: "Media into Backup",
      type: "local",
      mode: "push",
      srcsharedfolderref: MEDIA,
      srcuri: "",
      destsharedfolderref: BACKUP,
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
    });
    expect(Object.keys(request ?? {})).toHaveLength(36);
    expect(validate(request)).toBeUndefined();
  });

  it("writes a push over SSH and a pull from an rsync server in their own shapes", () => {
    const push = jobRequest({
      uuid: NEW_JOB_UUID,
      choices: choices({ to: sshTo({ port: 2222 }), deletes: true }),
      enable: true,
      dryrun: false,
      password: "not sent",
    });
    expect(push).toMatchObject({
      type: "remote",
      mode: "push",
      srcsharedfolderref: MEDIA,
      srcuri: "",
      destsharedfolderref: "",
      desturi: "alex@backup.example.org:/srv/copies/",
      authentication: "pubkey",
      sshcertificateref: KEY,
      sshport: 2222,
      password: "",
      optiondelete: true,
    });
    expect(validate(push)).toBeUndefined();
    const pull = jobRequest({
      uuid: NEW_JOB_UUID,
      choices: choices({
        from: {
          kind: "remote",
          remote: {
            ...emptyRemote("rsyncd"),
            host: "backup.example.org",
            user: "copier",
            module: "photos",
          },
        },
        to: { kind: "folder", uuid: PULLED },
      }),
      enable: true,
      dryrun: false,
      password: "typed again",
    });
    expect(pull).toMatchObject({
      type: "remote",
      mode: "pull",
      srcsharedfolderref: "",
      srcuri: "rsync://copier@backup.example.org/photos/",
      destsharedfolderref: PULLED,
      desturi: "",
      authentication: "password",
      password: "typed again",
      sshcertificateref: "",
    });
    expect(validate(pull)).toBeUndefined();
  });

  it("writes a stored job back with only the changes, keeping its options and schedule", () => {
    const base: RsyncJob = {
      ...PUSH,
      optioncompress: true,
      extraoptions: "--bwlimit=100",
      minute: ["0", "30"],
      hour: ["6"],
      everynhour: true,
    };
    const opened = choicesFromJob(base);
    expect(opened).not.toBeNull();
    if (opened === null) {
      return;
    }
    expect(opened.schedule).toMatchObject({
      frequency: "custom",
      stored: true,
    });
    const request = jobRequest({
      uuid: base.uuid,
      choices: { ...opened, comment: "Renamed" },
      enable: base.enable,
      dryrun: false,
      password: "",
      base,
    });
    expect(request).toMatchObject({
      uuid: base.uuid,
      comment: "Renamed",
      desturi: base.dest.uri,
      sshcertificateref: KEY,
      optioncompress: true,
      extraoptions: "--bwlimit=100",
      minute: ["0", "30"],
      hour: ["6"],
      everynhour: true,
    });
    expect(Object.keys(request ?? {})).toHaveLength(36);
    expect(validate(request)).toBeUndefined();
  });

  it("never sends a password it was not given", () => {
    const opened = choicesFromJob(PULL);
    const request =
      opened &&
      jobRequest({
        uuid: PULL.uuid,
        choices: opened,
        enable: true,
        dryrun: false,
        password: "",
        base: PULL,
      });
    expect(request?.password).toBe("");
  });

  it("opens a stored remote address on its fields, or keeps one it cannot split", () => {
    expect(choicesFromJob(PULL)?.from).toEqual({
      kind: "remote",
      remote: {
        ...emptyRemote("rsyncd"),
        host: "backup.example.org",
        user: "copier",
        module: "photos",
      },
    });
    const classic = choicesFromJob({
      ...PULL,
      src: { uri: "backup.example.org::photos" },
      srcuri: "backup.example.org::photos",
    });
    expect(classic?.from).toMatchObject({
      kind: "remote",
      remote: { keep: "backup.example.org::photos" },
    });
  });
});

describe("what a change needs (section 6)", () => {
  const before = choices();
  it.each([
    ["only the note", { comment: "New" }, "save", false],
    [
      "only the schedule",
      { schedule: { ...defaultScheduleValue, hour: "5" } },
      "save",
      false,
    ],
    [
      "only when I start it",
      { schedule: { ...defaultScheduleValue, mode: "manual" as const } },
      "save",
      false,
    ],
    ["email", { sendemail: true }, "save", false],
    [
      "the destination",
      { to: { kind: "folder" as const, uuid: PULLED } },
      "trial",
      false,
    ],
    [
      "the direction",
      {
        from: { kind: "folder" as const, uuid: BACKUP },
        to: { kind: "folder" as const, uuid: MEDIA },
      },
      "trial",
      false,
    ],
    ["another computer instead", { to: sshTo() }, "trial", false],
    ["deletion turned on", { deletes: true }, "trial", false],
  ])("%s: %s", (_name, change, need, off) => {
    expect(changeNeed(before, { ...before, ...change }, "")).toEqual({
      need,
      deletionOff: off,
      extraStillDeletes: false,
    });
  });

  it("saves deletion turned off, and says when the extra options still delete", () => {
    const deleting = choices({ deletes: true });
    expect(changeNeed(deleting, { ...deleting, deletes: false }, "")).toEqual({
      need: "save",
      deletionOff: true,
      extraStillDeletes: false,
    });
    expect(
      changeNeed(deleting, { ...deleting, deletes: false }, "--delete-after"),
    ).toMatchObject({ need: "save", extraStillDeletes: true });
  });

  it("sees a remote side's folder change as a new destination", () => {
    const remote = choices({ to: sshTo() });
    expect(
      changeNeed(remote, { ...remote, to: sshTo({ path: "/srv/other" }) }, "")
        .need,
    ).toBe("trial");
    expect(
      changeNeed(remote, { ...remote, to: sshTo({ key: "other" }) }, "").need,
    ).toBe("save");
  });
});

describe("what a trial was of", () => {
  it("changes with the sides, the direction and deletion, not with the note or schedule", () => {
    const key = trialKey(LOCAL);
    expect(
      trialKey({ ...LOCAL, comment: "x", minute: ["5"] } as RsyncJob),
    ).toBe(key);
    expect(trialKey({ ...LOCAL, optiondelete: true })).not.toBe(key);
    expect(trialKey({ ...LOCAL, extraoptions: "--delete-after" })).not.toBe(
      key,
    );
    expect(trialKey({ ...LOCAL, dest: { sharedfolderref: PULLED } })).not.toBe(
      key,
    );
  });
});
