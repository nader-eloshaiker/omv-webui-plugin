// SPDX-License-Identifier: GPL-3.0-or-later
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  changedSince,
  groupsToSend,
  isAdministrator,
  isNoLoginShell,
  LOGIN_SHELL,
  mayDelete,
  mayRemoveAdmin,
  newUserParams,
  NOLOGIN_SHELL,
  omvGroupsOf,
  otherSystemGroups,
  selfReading,
  shellToSend,
  sshAllowed,
  sshBlocked,
  sshReading,
  userSetParams,
  type SshState,
} from "./userModel.ts";

const OMV_GROUPS = [
  { name: "example-team", members: ["alex"] },
  { name: "example-kids", members: [] },
];

const person = (over: Partial<UserAccount> = {}): UserAccount => ({
  name: "alex",
  uid: 1003,
  gid: 100,
  comment: "Alex at home",
  dir: "/nonexistent",
  shell: NOLOGIN_SHELL,
  groups: ["users"],
  system: false,
  email: "alex@example.org",
  disallowusermod: false,
  sshpubkeys: [],
  ...over,
});

const SSH_ON: SshState = {
  settings: {
    enable: true,
    passwordauthentication: true,
    pubkeyauthentication: true,
  },
  running: true,
  pending: false,
};

describe("the account's powers (0.3, 0.5)", () => {
  it("reads administrator and SSH from the groups", () => {
    expect(
      isAdministrator(person({ groups: ["users", "openmediavault-admin"] })),
    ).toBe(true);
    expect(isAdministrator(person())).toBe(false);
    expect(sshAllowed(person({ groups: ["users", "_ssh"] }))).toBe(true);
    expect(sshAllowed(person({ groups: ["users", "root"] }))).toBe(true);
    expect(sshAllowed(person())).toBe(false);
  });

  it.each([
    "/usr/sbin/nologin",
    "/sbin/nologin",
    "/usr/bin/false",
    "/bin/false",
    "",
    undefined,
  ])("%s opens no command line", (shell) => {
    expect(isNoLoginShell(shell)).toBe(true);
  });

  it.each(["/usr/bin/sh", "/bin/sh", "/bin/bash"])("%s opens one", (shell) => {
    expect(isNoLoginShell(shell)).toBe(false);
  });
});

describe("sshReading (0.3, every row)", () => {
  const ssh = person({ groups: ["users", "_ssh"], shell: LOGIN_SHELL });
  it.each<[string, UserAccount, SshState, string]>([
    ["not in _ssh or root", person(), SSH_ON, "no"],
    [
      "in root, whatever else",
      person({ groups: ["users", "root"] }),
      { ...SSH_ON, settings: null },
      "root",
    ],
    ["in _ssh, it works", ssh, SSH_ON, "yes"],
    [
      "in _ssh, no-login shell",
      person({ groups: ["users", "_ssh"] }),
      SSH_ON,
      "noLoginShell",
    ],
    [
      "in _ssh, SSH off",
      ssh,
      { ...SSH_ON, settings: { ...SSH_ON.settings!, enable: false } },
      "sshOff",
    ],
    ["in _ssh, not running", ssh, { ...SSH_ON, running: false }, "notRunning"],
    [
      "in _ssh, not running but pending",
      ssh,
      { ...SSH_ON, running: false, pending: true },
      "yes",
    ],
    [
      "in _ssh, keys only and no key",
      ssh,
      {
        ...SSH_ON,
        settings: { ...SSH_ON.settings!, passwordauthentication: false },
      },
      "keysOnly",
    ],
    [
      "in _ssh, keys only with a key",
      {
        ...ssh,
        sshpubkeys: [
          "---- BEGIN SSH2 PUBLIC KEY ----\nAAAA\n---- END SSH2 PUBLIC KEY ----",
        ],
      },
      {
        ...SSH_ON,
        settings: { ...SSH_ON.settings!, passwordauthentication: false },
      },
      "yes",
    ],
    [
      "in _ssh, keys only with a key, but key sign-in off too",
      {
        ...ssh,
        sshpubkeys: [
          "---- BEGIN SSH2 PUBLIC KEY ----\nAAAA\n---- END SSH2 PUBLIC KEY ----",
        ],
      },
      {
        ...SSH_ON,
        settings: {
          enable: true,
          passwordauthentication: false,
          pubkeyauthentication: false,
        },
      },
      "keysOnly",
    ],
    [
      "in _ssh, the reads failed",
      ssh,
      { settings: null, running: undefined, pending: false },
      "unread",
    ],
  ])("%s", (_label, user, state, kind) => {
    expect(sshReading(user, state).kind).toBe(kind);
  });

  it("calls rows 3 to 6 blocked", () => {
    expect(sshBlocked({ kind: "noLoginShell" })).toBe(true);
    expect(sshBlocked({ kind: "sshOff" })).toBe(true);
    expect(sshBlocked({ kind: "notRunning" })).toBe(true);
    expect(sshBlocked({ kind: "keysOnly" })).toBe(true);
    expect(sshBlocked({ kind: "yes" })).toBe(false);
    expect(sshBlocked({ kind: "unread" })).toBe(false);
  });
});

describe("groups (0.5)", () => {
  it("lists other system groups, never users or the two offered", () => {
    const user = person({
      groups: [
        "users",
        "openmediavault-admin",
        "_ssh",
        "sudo",
        "example-team",
        "audio",
      ],
    });
    expect(otherSystemGroups(user, OMV_GROUPS).map((g) => g.name)).toEqual([
      "sudo",
      "audio",
    ]);
  });

  it("finds OMV groups from the person's groups and the groups' members", () => {
    expect(omvGroupsOf(person(), OMV_GROUPS)).toEqual(["example-team"]);
    expect(
      omvGroupsOf(person({ groups: ["users", "example-kids"] }), OMV_GROUPS),
    ).toEqual(["example-team", "example-kids"]);
  });

  it.each<
    [
      string,
      string[],
      { admin: boolean; ssh: boolean; omvGroups: string[] },
      string[],
    ]
  >([
    [
      "nothing chosen",
      ["users"],
      { admin: false, ssh: false, omvGroups: [] },
      ["users"],
    ],
    [
      "both chosen and a group",
      ["users"],
      { admin: true, ssh: true, omvGroups: ["example-team"] },
      ["users", "openmediavault-admin", "_ssh", "example-team"],
    ],
    [
      "system groups kept as read",
      [
        "users",
        "sudo",
        "docker",
        "_ssh",
        "openmediavault-admin",
        "example-team",
      ],
      { admin: false, ssh: false, omvGroups: [] },
      ["users", "sudo", "docker"],
    ],
    [
      "a read list without users still sends users first",
      ["example-team"],
      { admin: false, ssh: true, omvGroups: ["example-kids"] },
      ["users", "_ssh", "example-kids"],
    ],
    [
      "no duplicates",
      ["users", "root"],
      { admin: true, ssh: true, omvGroups: ["example-team", "example-team"] },
      ["users", "root", "openmediavault-admin", "_ssh", "example-team"],
    ],
  ])("%s", (_label, read, choices, expected) => {
    const sent = groupsToSend({ groups: read }, OMV_GROUPS, choices);
    expect(sent).toEqual(expected);
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe("shellToSend (Q5, D6, D7)", () => {
  it.each<[string | undefined, boolean, boolean, string]>([
    [NOLOGIN_SHELL, false, true, LOGIN_SHELL],
    ["/bin/false", false, true, LOGIN_SHELL],
    ["/bin/bash", false, true, "/bin/bash"],
    [LOGIN_SHELL, true, false, NOLOGIN_SHELL],
    ["/bin/bash", true, false, NOLOGIN_SHELL],
    ["/bin/bash", true, true, "/bin/bash"],
    [NOLOGIN_SHELL, false, false, NOLOGIN_SHELL],
    [undefined, false, false, NOLOGIN_SHELL],
  ])("%s, SSH %s -> %s", (read, before, after, expected) => {
    expect(shellToSend(read, before, after)).toBe(expected);
  });
});

describe("the signed-in person (0.8, fail closed)", () => {
  it.each([
    [null, "unknown"],
    [undefined, "unknown"],
    ["", "unknown"],
    ["alex", "self"],
    ["robin", "other"],
  ] as const)("%s", (session, expected) => {
    expect(selfReading(session, "alex")).toBe(expected);
  });

  it("never lets the reader take away their own rights or delete themselves", () => {
    const admin = person({ groups: ["users", "openmediavault-admin"] });
    expect(mayRemoveAdmin("self")).toBe(false);
    expect(mayRemoveAdmin("unknown")).toBe(false);
    expect(mayRemoveAdmin("other")).toBe(true);
    expect(mayDelete("self", person())).toBe(false);
    expect(mayDelete("unknown", admin)).toBe(false);
    expect(mayDelete("unknown", person())).toBe(true);
    expect(mayDelete("other", admin)).toBe(true);
  });
});

describe("what a save sends (0.11)", () => {
  it("writes back every field as read, without uid, with an empty password", () => {
    const read = person({
      groups: ["users", "sudo"],
      sshpubkeys: [
        "---- BEGIN SSH2 PUBLIC KEY ----\nAAAA\n---- END SSH2 PUBLIC KEY ----",
      ],
      disallowusermod: true,
    });
    const sent = userSetParams(read, { comment: "Alex" });
    expect(sent).toEqual({
      name: "alex",
      groups: ["users", "sudo"],
      shell: NOLOGIN_SHELL,
      password: "",
      email: "alex@example.org",
      comment: "Alex",
      disallowusermod: true,
      sshpubkeys: read.sshpubkeys,
    });
    expect("uid" in sent).toBe(false);
  });

  it("makes a new person with no login shell unless SSH is chosen", () => {
    const base = {
      name: "sam",
      password: "pw",
      email: "",
      comment: "",
      groups: ["users"],
    };
    expect(newUserParams({ ...base, ssh: false }).shell).toBe(NOLOGIN_SHELL);
    expect(newUserParams({ ...base, ssh: true }).shell).toBe(LOGIN_SHELL);
    expect(newUserParams({ ...base, ssh: false }).sshpubkeys).toEqual([]);
    expect(newUserParams({ ...base, ssh: false }).disallowusermod).toBe(false);
  });

  it("stops a save when something changed elsewhere", () => {
    const shown = person();
    expect(changedSince(shown, person())).toEqual([]);
    expect(changedSince(shown, person({ groups: ["users", "sudo"] }))).toEqual([
      "groups",
    ]);
    expect(changedSince(shown, person({ email: "x@example.org" }))).toEqual([
      "email",
    ]);
    expect(
      changedSince(shown, person({ email: "x@example.org" }), ["email"]),
    ).toEqual([]);
    expect(changedSince(shown, person({ shell: LOGIN_SHELL }))).toEqual([
      "shell",
    ]);
    expect(changedSince(shown, person({ disallowusermod: true }))).toEqual([
      "disallowusermod",
    ]);
  });
});
