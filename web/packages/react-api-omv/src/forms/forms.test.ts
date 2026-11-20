// SPDX-License-Identifier: GPL-3.0-or-later
// The generated form schemas accept what the contract accepts, and the OMV formats in use accept
// and reject what OMV's own checks do (docs/04, "Request schemas"; docs/08, "Forms").
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  SessionLoginRequestSchema,
  SessionVerifyRequestSchema,
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
