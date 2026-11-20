// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import {
  createSessionStore,
  landingAfterSignIn,
  sessionReducer,
  SIGNED_OUT,
  type SessionState,
} from "./sessionStore.ts";

const ADMIN: SessionState = {
  status: "signedIn",
  username: "example-admin",
  role: "admin",
};

describe("sessionReducer", () => {
  it("signs in from the form and from the code step", () => {
    expect(
      sessionReducer(SIGNED_OUT, {
        type: "signedIn",
        username: "example-admin",
        role: "admin",
      }),
    ).toEqual(ADMIN);
  });

  it("keeps the route to resume through the code step", () => {
    const ended = sessionReducer(ADMIN, { type: "ended", resume: "/storage" });
    expect(ended).toEqual({
      status: "signedOut",
      notice: "ended",
      resume: "/storage",
    });
    const challenged = sessionReducer(ended, {
      type: "challenged",
      username: "example-2fa",
      kind: "totp",
    });
    expect(challenged).toMatchObject({
      status: "challenge",
      resume: "/storage",
    });
    expect(sessionReducer(challenged, { type: "challengeExpired" })).toEqual({
      status: "signedOut",
      notice: "challengeExpired",
      resume: "/storage",
    });
    expect(sessionReducer(challenged, { type: "challengeAbandoned" })).toEqual({
      status: "signedOut",
      notice: null,
      resume: "/storage",
    });
  });

  it("ignores a 401 when no session was believed in (the first read after a reload)", () => {
    expect(sessionReducer(SIGNED_OUT, { type: "ended", resume: "/" })).toBe(
      SIGNED_OUT,
    );
    const challenge: SessionState = {
      status: "challenge",
      username: "example-2fa",
      kind: "totp",
      resume: null,
    };
    expect(sessionReducer(challenge, { type: "ended", resume: "/" })).toBe(
      challenge,
    );
  });

  it("forgets the route to resume on signing out", () => {
    expect(sessionReducer(ADMIN, { type: "signedOut" })).toEqual({
      status: "signedOut",
      notice: "signedOut",
      resume: null,
    });
  });
});

describe("landingAfterSignIn (UI-3)", () => {
  it.each([
    [null, "/"],
    ["/", "/"],
    ["/storage/disks?page=2", "/storage/disks?page=2"],
    ["//evil.example", "/"],
    ["https://evil.example/", "/"],
    ["data:text/html,hi", "/"],
  ])("resume %s lands on %s", (resume, landing) => {
    expect(
      landingAfterSignIn({ status: "signedOut", notice: "ended", resume }),
    ).toBe(landing);
  });
});

describe("createSessionStore", () => {
  it("notifies on a change, and not on an event that changes nothing", () => {
    const store = createSessionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "challengeAbandoned" });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: "signedIn", username: "a", role: "user" });
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      status: "signedIn",
      role: "user",
    });
  });
});
