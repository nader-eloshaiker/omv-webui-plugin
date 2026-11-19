// SPDX-License-Identifier: GPL-3.0-or-later
// The generated form schemas accept what the contract accepts, and the OMV formats in use accept
// and reject what OMV's own checks do (docs/04, "Request schemas"; docs/08, "Forms").
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  SessionLoginRequestSchema,
  SessionVerifyRequestSchema,
  SshSetRequestSchema,
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
