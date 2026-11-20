// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { SshSettings } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  fromDraft,
  isDirty,
  linesSet,
  pagePort,
  portProblem,
  sshWarnings,
  toDraft,
} from "./sshForm.ts";

const DEFAULTS: SshSettings = { ...CONTRACT_EXAMPLES.sshGet.defaults.value };

describe("the draft", () => {
  it("round-trips the server's settings, with the port as text", () => {
    const draft = toDraft(DEFAULTS);
    expect(draft.port).toBe("22");
    expect(fromDraft(draft)).toEqual(DEFAULTS);
    expect(fromDraft({ ...draft, port: " 2222 " }).port).toBe(2222);
  });

  it("is dirty only when a value differs", () => {
    expect(isDirty(DEFAULTS, toDraft(DEFAULTS))).toBe(false);
    expect(isDirty(DEFAULTS, { ...toDraft(DEFAULTS), port: "2222" })).toBe(
      true,
    );
    expect(isDirty(DEFAULTS, { ...toDraft(DEFAULTS), compression: true })).toBe(
      true,
    );
    expect(isDirty(DEFAULTS, { ...toDraft(DEFAULTS), extraoptions: " " })).toBe(
      true,
    );
  });
});

describe("pagePort", () => {
  it("is the location's port, or the scheme's default", () => {
    expect(pagePort({ port: "8080", protocol: "http:" })).toBe("8080");
    expect(pagePort({ port: "", protocol: "http:" })).toBe("80");
    expect(pagePort({ port: "", protocol: "https:" })).toBe("443");
  });
});

describe("portProblem", () => {
  it.each([
    ["", "required"],
    ["   ", "required"],
    ["0", "range"],
    ["65536", "range"],
    ["22.5", "range"],
    ["-22", "range"],
    ["2e3", "range"],
    ["ssh", "range"],
    ["80", "inUse"],
    ["080", "inUse"],
    ["22", null],
    [" 2222 ", null],
    ["65535", null],
  ] as const)("%j on a page served on port 80 is %s", (port, problem) => {
    expect(portProblem(port, "80")).toBe(problem);
  });
});

describe("sshWarnings", () => {
  const none = {
    turningOff: false,
    noMethod: false,
    rootPassword: false,
    keysOnly: false,
  };
  const safe: SshSettings = { ...DEFAULTS, permitrootlogin: false };

  it("warns about root signing in with a password, OMV's default", () => {
    expect(sshWarnings(DEFAULTS, toDraft(DEFAULTS))).toEqual({
      ...none,
      rootPassword: true,
    });
    expect(sshWarnings(safe, toDraft(safe))).toEqual(none);
  });

  it("warns when SSH is turned off, and says nothing else about an SSH that is off", () => {
    expect(
      sshWarnings(DEFAULTS, {
        ...toDraft(DEFAULTS),
        enable: false,
        passwordauthentication: false,
        pubkeyauthentication: false,
      }),
    ).toEqual({ ...none, turningOff: true });
  });

  it("warns when both ways of signing in are off", () => {
    expect(
      sshWarnings(safe, {
        ...toDraft(safe),
        passwordauthentication: false,
        pubkeyauthentication: false,
      }),
    ).toEqual({ ...none, noMethod: true });
  });

  it("warns when the password is switched off and only keys remain", () => {
    expect(
      sshWarnings(safe, { ...toDraft(safe), passwordauthentication: false }),
    ).toEqual({ ...none, keysOnly: true });
    // Already keys-only when loaded: nothing changes, so nothing to warn about.
    const keysOnly = { ...safe, passwordauthentication: false };
    expect(sshWarnings(keysOnly, toDraft(keysOnly))).toEqual(none);
  });
});

describe("linesSet", () => {
  it("counts the lines that hold something", () => {
    expect(linesSet("")).toBe(0);
    expect(linesSet("\n  \n")).toBe(0);
    expect(linesSet("MaxAuthTries 3")).toBe(1);
    expect(linesSet("A 1\r\n\nB 2\n")).toBe(2);
  });
});
