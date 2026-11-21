// SPDX-License-Identifier: GPL-3.0-or-later
// The generated form schemas accept what the contract accepts, and the OMV formats in use accept
// and reject what OMV's own checks do (docs/04, "Request schemas"; docs/08, "Forms").
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  DiskMgmtSetHdParmRequestSchema,
  SessionLoginRequestSchema,
  SessionVerifyRequestSchema,
  SmartDeleteScheduledTestRequestSchema,
  SmartSetDeviceSettingsRequestSchema,
  SmartSetScheduledTestRequestSchema,
  SmartSetSettingsRequestSchema,
  SshSetRequestSchema,
  UserMgmtSetPasswordByContextRequestSchema,
  UserMgmtSetUserByContextRequestSchema,
} from "./generated/index.ts";

const ok = (schema: v.GenericSchema, value: unknown) =>
  v.safeParse(schema, value).success;
const login = (username: string, password = "secret") => ({
  username,
  password,
});

describe("username (OMV format `username`)", () => {
  it.each(["admin", "example-user", "a.b_c", "_svc", "machine$", "9lives"])(
    "accepts %s",
    (name) => {
      expect(ok(SessionLoginRequestSchema, login(name))).toBe(true);
    },
  );
  it.each([
    "",
    " admin",
    "admin ",
    "-dash",
    "a b",
    "a/b",
    "a$b",
    "ünïcode",
    "a\nb",
  ])("rejects %j", (name) => {
    expect(ok(SessionLoginRequestSchema, login(name))).toBe(false);
  });
});

describe("password (OMV format `no-multi-line`)", () => {
  it.each(["", "with spaces and $ymbols", "ünïcode"])(
    "accepts %j",
    (password) => {
      expect(ok(SessionLoginRequestSchema, login("admin", password))).toBe(
        true,
      );
    },
  );
  it.each(["two\nlines", "carriage\rreturn"])("rejects %j", (password) => {
    expect(ok(SessionLoginRequestSchema, login("admin", password))).toBe(false);
  });
});

describe("one-time code", () => {
  it.each(["000000", "123456"])("accepts %s", (code) =>
    expect(ok(SessionVerifyRequestSchema, { code })).toBe(true),
  );
  it.each(["12345", "1234567", "12a456", " 123456"])("rejects %j", (code) =>
    expect(ok(SessionVerifyRequestSchema, { code })).toBe(false),
  );
});

describe("SSH settings", () => {
  const valid = {
    enable: true,
    port: 22,
    passwordauthentication: true,
    pubkeyauthentication: true,
    permitrootlogin: false,
    tcpforwarding: false,
    compression: false,
    extraoptions: "",
  };
  it("accepts a complete form", () =>
    expect(ok(SshSetRequestSchema, valid)).toBe(true));
  it.each([0, 65536, 22.5])("rejects port %d", (port) =>
    expect(ok(SshSetRequestSchema, { ...valid, port })).toBe(false),
  );
  it("rejects a missing field (every field is required)", () => {
    const { compression: _omitted, ...rest } = valid;
    expect(ok(SshSetRequestSchema, rest)).toBe(false);
  });
  it("rejects 0/1 for a boolean (OMV checks types strictly)", () => {
    expect(ok(SshSetRequestSchema, { ...valid, enable: 1 })).toBe(false);
  });
  it("rejects a field the contract does not name", () => {
    expect(ok(SshSetRequestSchema, { ...valid, banner: "hi" })).toBe(false);
  });
});

describe("e-mail address (OMV format `email`, or empty)", () => {
  const account = (email: string) => ({ email, comment: "" });
  it.each([
    "",
    "admin@example.com",
    "first.last+tag@mail.example.org",
    "o'brien@example.net",
    "x@a-b.example.com",
    "UPPER@EXAMPLE.COM",
  ])("accepts %j", (email) => {
    expect(ok(UserMgmtSetUserByContextRequestSchema, account(email))).toBe(
      true,
    );
  });
  it.each([
    " ",
    "admin",
    "admin@",
    "@example.com",
    "admin@localhost",
    "admin@example.123",
    "admin@-example.com",
    "admin@example-.com",
    ".admin@example.com",
    "ad..min@example.com",
    "admin.@example.com",
    "two@at@example.com",
    "admin @example.com",
    '"quoted"@example.com',
    "admin@[192.0.2.1]",
    "admin@example.com\n",
    `${"a".repeat(65)}@example.com`,
    `a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(63)}.com`,
  ])("rejects %j", (email) => {
    expect(ok(UserMgmtSetUserByContextRequestSchema, account(email))).toBe(
      false,
    );
  });
});

describe("my account", () => {
  it.each(["", "Backup operator", "Ünïcode, with punctuation."])(
    "accepts the description %j",
    (comment) => {
      expect(
        ok(UserMgmtSetUserByContextRequestSchema, { email: "", comment }),
      ).toBe(true);
    },
  );
  it.each(["a:b", "two\nlines", "carriage\rreturn"])(
    "rejects the description %j",
    (comment) => {
      expect(
        ok(UserMgmtSetUserByContextRequestSchema, { email: "", comment }),
      ).toBe(false);
    },
  );
  it("rejects a password: it changes only through setPasswordByContext", () => {
    expect(
      ok(UserMgmtSetUserByContextRequestSchema, {
        email: "",
        comment: "",
        password: "secret",
      }),
    ).toBe(false);
  });
  it("rejects a missing field (both are required)", () => {
    expect(ok(UserMgmtSetUserByContextRequestSchema, { email: "" })).toBe(
      false,
    );
  });
});

describe("my new password", () => {
  it.each(["x", "with spaces and $ymbols", "ünïcode"])(
    "accepts %j",
    (password) => {
      expect(ok(UserMgmtSetPasswordByContextRequestSchema, { password })).toBe(
        true,
      );
    },
  );
  it.each(["", "two\nlines", "carriage\rreturn"])("rejects %j", (password) => {
    expect(ok(UserMgmtSetPasswordByContextRequestSchema, { password })).toBe(
      false,
    );
  });
  it("rejects a field the contract does not name", () => {
    expect(
      ok(UserMgmtSetPasswordByContextRequestSchema, {
        password: "x",
        email: "",
      }),
    ).toBe(false);
  });
});

// OMV's placeholder for an object not yet saved: the UUID a create sends.
const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

describe("device file (OMV format `devicefile`)", () => {
  const hdparm = (devicefile: string) => ({
    uuid: NEW_OBJECT,
    devicefile,
    apm: 0,
    aam: 0,
    spindowntime: 0,
    writecache: false,
  });
  it.each([
    "/dev/sda",
    "/dev/nvme0n1",
    "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0101",
    "/dev/disk/by-id/wwn-0x5000c500a1b2c3d4",
    "/dev/disk/by-path/pci-0000:00:17.0-ata-1",
    "/dev/mapper/vg0-data+1",
  ])("accepts %s", (devicefile) => {
    expect(ok(DiskMgmtSetHdParmRequestSchema, hdparm(devicefile))).toBe(true);
  });
  it.each([
    "",
    "sda",
    "/dev/",
    "/devsda",
    "/tmp/sda",
    "/dev/sda b",
    "/dev/sda;reboot",
    "/dev/sda\n",
    "/dev/disk/by-id/ünïcode",
  ])("rejects %j", (devicefile) => {
    expect(ok(DiskMgmtSetHdParmRequestSchema, hdparm(devicefile))).toBe(false);
  });
});

describe("configuration object UUID (OMV format `uuidv4`)", () => {
  it.each([NEW_OBJECT, "00000000-0000-4000-8000-000000000201"])(
    "accepts %s",
    (uuid) => {
      expect(ok(SmartDeleteScheduledTestRequestSchema, { uuid })).toBe(true);
    },
  );
  it.each([
    "",
    "fa4b1c66ef7911e587a00002b3a176b4",
    "fa4b1c66-ef79-11e5-87a0-0002b3a176b",
    "fa4b1c66-ef79-11e5-87a0-0002b3a176b4 ",
    "{fa4b1c66-ef79-11e5-87a0-0002b3a176b4}",
    "ga4b1c66-ef79-11e5-87a0-0002b3a176b4",
  ])("rejects %j", (uuid) => {
    expect(ok(SmartDeleteScheduledTestRequestSchema, { uuid })).toBe(false);
  });
  it("rejects a field the contract does not name", () => {
    expect(
      ok(SmartDeleteScheduledTestRequestSchema, {
        uuid: NEW_OBJECT,
        all: true,
      }),
    ).toBe(false);
  });
});

describe("a disk's power settings", () => {
  const valid = {
    uuid: NEW_OBJECT,
    devicefile: "/dev/sda",
    apm: 127,
    aam: 0,
    spindowntime: 241,
    writecache: true,
  };
  it.each([
    { apm: 0 },
    { apm: 1 },
    { apm: 254 },
    { aam: 128 },
    { aam: 254 },
    { spindowntime: 0 },
    { spindowntime: 254 },
    { writecache: false },
  ])("accepts %j", (change) => {
    expect(ok(DiskMgmtSetHdParmRequestSchema, { ...valid, ...change })).toBe(
      true,
    );
  });
  it.each([
    // 255 passes the method's datamodel but not the stored object's, which the server also checks.
    { apm: 255 },
    { apm: -1 },
    { apm: 12.5 },
    { aam: 1 },
    { aam: 127 },
    { spindowntime: 255 },
    { spindowntime: -1 },
    { writecache: 1 },
    { apm: "127" },
  ])("rejects %j", (change) => {
    expect(ok(DiskMgmtSetHdParmRequestSchema, { ...valid, ...change })).toBe(
      false,
    );
  });
  it.each(Object.keys(valid))("rejects a request without %s", (field) => {
    const rest = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== field),
    );
    expect(ok(DiskMgmtSetHdParmRequestSchema, rest)).toBe(false);
  });
});

describe("S.M.A.R.T. settings for every disk", () => {
  const valid = {
    enable: true,
    interval: 1800,
    powermode: "standby",
    tempdiff: 0,
    tempmax: 0,
  };
  it.each([
    { interval: 10 },
    { powermode: "never" },
    { powermode: "sleep" },
    { powermode: "idle" },
    { tempdiff: 255 },
    { tempmax: 255 },
  ])("accepts %j", (change) => {
    expect(ok(SmartSetSettingsRequestSchema, { ...valid, ...change })).toBe(
      true,
    );
  });
  it.each([
    { interval: 9 },
    { interval: 60.5 },
    { powermode: "always" },
    { powermode: "Standby" },
    { tempdiff: -1 },
    { tempdiff: 256 },
    { tempmax: 256 },
    { enable: "true" },
    { monitor: "" },
  ])("rejects %j", (change) => {
    expect(ok(SmartSetSettingsRequestSchema, { ...valid, ...change })).toBe(
      false,
    );
  });
});

describe("one disk's S.M.A.R.T. monitoring settings", () => {
  const valid = {
    uuid: NEW_OBJECT,
    devicefile: "/dev/nvme0n1",
    enable: true,
    tempdiff: 0,
    tempmax: 0,
  };
  it("accepts a complete form", () =>
    expect(ok(SmartSetDeviceSettingsRequestSchema, valid)).toBe(true));
  it.each([{ tempdiff: 15 }, { tempmax: 80 }, { enable: false }])(
    "accepts %j",
    (change) => {
      expect(
        ok(SmartSetDeviceSettingsRequestSchema, { ...valid, ...change }),
      ).toBe(true);
    },
  );
  // The datamodel requires only devicefile and enable, but the method reads all five.
  it.each(["uuid", "tempdiff", "tempmax", "devicefile", "enable"])(
    "rejects a request without %s",
    (field) => {
      const rest = Object.fromEntries(
        Object.entries(valid).filter(([k]) => k !== field),
      );
      expect(ok(SmartSetDeviceSettingsRequestSchema, rest)).toBe(false);
    },
  );
  it.each([{ tempdiff: 256 }, { tempmax: -5 }, { _used: false }])(
    "rejects %j",
    (change) => {
      expect(
        ok(SmartSetDeviceSettingsRequestSchema, { ...valid, ...change }),
      ).toBe(false);
    },
  );
});

describe("a scheduled S.M.A.R.T. self-test", () => {
  const valid = {
    uuid: NEW_OBJECT,
    enable: true,
    devicefile: "/dev/nvme0n1",
    comment: "",
    type: "S",
    hour: "02",
    month: "*",
    dayofmonth: "*",
    dayofweek: "7",
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const range = (from: number, to: number, format = pad) =>
    Array.from({ length: to - from + 1 }, (_, i) => format(from + i));
  // Exactly the values the stock form offers, each anchored at both ends.
  const offered = {
    hour: ["*", ...range(0, 23)],
    month: ["*", ...range(1, 12)],
    dayofmonth: ["*", ...range(1, 31)],
    dayofweek: ["*", ...range(1, 7, String)],
  };
  const refused = {
    hour: [
      "",
      "0",
      "9",
      "24",
      "000",
      "002",
      "02 ",
      " 02",
      "*1",
      "1*",
      "**",
      "0*",
      "2a",
    ],
    month: ["", "0", "00", "1", "13", "012", "01x", "x01", "1*", "**"],
    dayofmonth: ["", "0", "00", "1", "32", "40", "011", "3 1", "*0", "**"],
    dayofweek: ["", "0", "8", "01", "07", "17", "1*", "*7", "**", "7\n"],
  };
  const cases = (table: Record<string, string[]>) =>
    Object.entries(table).flatMap(([field, values]) =>
      values.map((value) => ({ field, value })),
    );

  it.each(cases(offered))("accepts $field $value", ({ field, value }) => {
    expect(
      ok(SmartSetScheduledTestRequestSchema, { ...valid, [field]: value }),
    ).toBe(true);
  });
  // rpc.smart.setscheduledtest's own patterns, as OMV runs them (`/%s/u`): the contract accepts
  // nothing OMV refuses.
  const omv: Record<string, RegExp> = {
    hour: /^0[0-9]|1[0-9]|2[0-3]|[*]$/u,
    month: /^0[1-9]|1[0-2]|[*]$/u,
    dayofmonth: /^0[1-9]|1[0-9]|2[0-9]|3[0-1]|[*]$/u,
    dayofweek: /^[1-7]|[*]$/u,
  };
  it.each(cases(offered))(
    "$field $value also passes OMV's check",
    ({ field, value }) => {
      expect(omv[field]?.test(value)).toBe(true);
    },
  );
  it.each(cases(refused))("rejects $field $value", ({ field, value }) => {
    expect(
      ok(SmartSetScheduledTestRequestSchema, { ...valid, [field]: value }),
    ).toBe(false);
  });
  it.each(["S", "L", "C", "O"])("accepts the test type %s", (type) => {
    expect(ok(SmartSetScheduledTestRequestSchema, { ...valid, type })).toBe(
      true,
    );
  });
  it.each(["", "s", "short", "X"])("rejects the test type %j", (type) => {
    expect(ok(SmartSetScheduledTestRequestSchema, { ...valid, type })).toBe(
      false,
    );
  });
  it.each(Object.keys(valid))("rejects a request without %s", (field) => {
    const rest = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== field),
    );
    expect(ok(SmartSetScheduledTestRequestSchema, rest)).toBe(false);
  });
});
