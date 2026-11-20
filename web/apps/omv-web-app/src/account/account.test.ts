// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  detailsEditable,
  detailsProblems,
  parseSshKey,
  shortKey,
} from "./account.ts";

describe("detailsEditable", () => {
  it("lets only a normal user whose account is not locked edit the details", () => {
    expect(detailsEditable("user", false)).toBe(true);
    expect(detailsEditable("user", true)).toBe(false);
    expect(detailsEditable("admin", false)).toBe(false);
    expect(detailsEditable("admin", true)).toBe(false);
  });
});

describe("detailsProblems", () => {
  it("accepts an address or nothing, and a one-line description without a colon", () => {
    expect(detailsProblems({ email: "", comment: "" })).toEqual({
      email: false,
      comment: false,
    });
    expect(
      detailsProblems({ email: "name@example.com", comment: "Alex Example" }),
    ).toEqual({ email: false, comment: false });
  });

  it.each(["name", "name@", "@example.com", "name@example", "a b@example.com"])(
    "refuses the address %j",
    (email) => {
      expect(detailsProblems({ email, comment: "" }).email).toBe(true);
    },
  );

  it.each(["a:b", "two\nlines"])("refuses the description %j", (comment) => {
    expect(detailsProblems({ email: "", comment })).toEqual({
      email: false,
      comment: true,
    });
  });
});

describe("parseSshKey", () => {
  it("reads an RFC 4716 key with a quoted comment", () => {
    const key = [
      "---- BEGIN SSH2 PUBLIC KEY ----",
      'Comment: "laptop key"',
      "AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExample",
      "Example0000",
      "---- END SSH2 PUBLIC KEY ----",
    ].join("\n");
    expect(parseSshKey(key)).toEqual({
      comment: "laptop key",
      body: "AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExampleExample0000",
    });
  });

  it("reads a header continued over two lines, and a key without a comment", () => {
    const key = [
      "---- BEGIN SSH2 PUBLIC KEY ----",
      "Comment: a long \\",
      "comment",
      "x-other: value",
      "AAAAB3Nza",
      "---- END SSH2 PUBLIC KEY ----",
    ].join("\r\n");
    expect(parseSshKey(key)).toEqual({
      comment: "a long comment",
      body: "AAAAB3Nza",
    });
    expect(
      parseSshKey(
        "---- BEGIN SSH2 PUBLIC KEY ----\nAAAAB3Nza\n---- END SSH2 PUBLIC KEY ----",
      ),
    ).toEqual({ comment: null, body: "AAAAB3Nza" });
  });

  it("reads the one-line OpenSSH form", () => {
    expect(parseSshKey("ssh-ed25519 AAAAC3Nza example@host")).toEqual({
      comment: "example@host",
      body: "AAAAC3Nza",
    });
    expect(parseSshKey("ssh-ed25519 AAAAC3Nza")).toEqual({
      comment: null,
      body: "AAAAC3Nza",
    });
  });
});

describe("shortKey", () => {
  it("keeps the first and last 12 characters", () => {
    expect(shortKey("short")).toBe("short");
    expect(shortKey("A".repeat(12) + "middle" + "Z".repeat(12))).toBe(
      `${"A".repeat(12)}…${"Z".repeat(12)}`,
    );
  });
});
