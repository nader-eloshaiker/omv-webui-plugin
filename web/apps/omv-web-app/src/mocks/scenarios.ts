// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's scenarios: which of the contract's examples answer, for `pnpm dev:mock` and the tests.
// Development and test code only (UI-11); a production build never imports this module.
//
// The examples hold no state. The one thing tracked here is whether the mock session is signed in,
// so that a reload starts at sign-in and the screens of signing in can be walked: every operation
// outside Session answers 401 until Session.login (or verify) succeeds, and again after logout.
import type { Answers, FixedAnswer } from "@omv-webui/react-api-omv/mocks";

export const SCENARIOS = [
  "admin",
  "user",
  "secondFactor",
  "secondFactorOtherKind",
  "wrongPassword",
  "tooManyAttempts",
  "sessionExpired",
  "pendingChanges",
  "idleWarning",
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export const isScenarioName = (value: unknown): value is ScenarioName =>
  typeof value === "string" && (SCENARIOS as readonly string[]).includes(value);

/** What each scenario shows, for the picker. Development words, not the interface's. */
export const SCENARIO_LABELS: Record<ScenarioName, string> = {
  admin: "Administrator",
  user: "Normal user",
  secondFactor: "Second factor (one-time code)",
  secondFactorOtherKind: "Second factor of another kind",
  wrongPassword: "Wrong password",
  tooManyAttempts: "Too many attempts",
  sessionExpired: "Session ends after loading",
  pendingChanges: "Administrator, changes pending",
  idleWarning: "Idle warning soon (1-minute timeout)",
};

// Session replies with no captured example: written here, in the shape OMV sends (A3, A8).
const NOT_SIGNED_IN: FixedAnswer = {
  status: 401,
  message: "Session not authenticated.",
};
const SESSION_EXPIRED: FixedAnswer = {
  status: 401,
  message: "Session expired.",
};
// A challenge of a kind this interface has no form for (the e-mail code plugin, for one). Not
// captured: no such plugin was installed on the test VM (A10). OMV would also send the stock
// interface's redirect address, which the transport drops; it is left out here.
const OTHER_KIND_CHALLENGE: FixedAnswer = {
  status: 200,
  value: {
    username: "example-2fa",
    status: "challengeRequired",
    challenge: { kind: "emailotp" },
  },
};
// A one-minute timeout, so the idle warning opens after 30 seconds in the browser.
const ONE_MINUTE: FixedAnswer = { status: 200, value: { timeout: 1 } };

export interface MockSession {
  signedIn: boolean;
  /** A password was accepted and a second factor is awaited (A10). */
  pending: boolean;
  /** The next 401 says the session expired, as OMV's first answer after a timeout does. */
  expiring: boolean;
}

export const newMockSession = (signedIn = false): MockSession => ({
  signedIn,
  pending: false,
  expiring: false,
});

const SIGNED_IN_EXAMPLES = new Set(["authenticated", "authenticatedUser"]);

function signsIn(answer: string | FixedAnswer): boolean {
  if (typeof answer === "string") {
    return SIGNED_IN_EXAMPLES.has(answer);
  }
  const value = answer.value as { status?: unknown } | undefined;
  return answer.status === 200 && value?.status === "authenticated";
}

function challenges(answer: string | FixedAnswer): boolean {
  if (typeof answer === "string") {
    return answer === "challengeRequired";
  }
  const value = answer.value as { status?: unknown } | undefined;
  return answer.status === 200 && value?.status === "challengeRequired";
}

/**
 * The answers of a scenario. `session` is the mock's sign-in state, shared by every answer; start
 * it signed in to skip the sign-in screen. Like OMV, any other call while a second factor is
 * awaited discards the pending login, and Session.verify then answers 401 (A10).
 */
export function scenarioAnswers(
  name: ScenarioName,
  session: MockSession = newMockSession(),
): Answers {
  const user = name === "user";
  let ended = false;
  let readsBeforeEnd = 2;

  const login =
    <T extends string>(reply: () => T | FixedAnswer) =>
    (): T | FixedAnswer => {
      const answer = reply();
      session.pending = challenges(answer);
      if (signsIn(answer)) {
        session.signedIn = true;
      }
      return answer;
    };

  const guarded =
    <T extends string>(example: T | FixedAnswer) =>
    (): T | FixedAnswer => {
      session.pending = false;
      if (name === "sessionExpired" && session.signedIn && !ended) {
        // The reads of the boot succeed; the next call finds the session gone, once.
        if (--readsBeforeEnd < 0) {
          ended = true;
          session.signedIn = false;
          session.expiring = true;
        }
      }
      if (!session.signedIn) {
        if (session.expiring) {
          session.expiring = false;
          return SESSION_EXPIRED;
        }
        return NOT_SIGNED_IN;
      }
      return example;
    };

  return {
    sessionLogin: login(() => {
      switch (name) {
        case "user":
          return "authenticatedUser";
        case "secondFactor":
          return "challengeRequired";
        case "secondFactorOtherKind":
          return OTHER_KIND_CHALLENGE;
        case "wrongPassword":
          return "wrongPassword";
        case "tooManyAttempts":
          return "tooManyAttempts";
        default:
          return "authenticated";
      }
    }),
    sessionVerify: () => {
      if (!session.pending) {
        return "noPendingLogin";
      }
      if (name === "tooManyAttempts") {
        return "tooManyAttempts";
      }
      session.pending = false;
      session.signedIn = true;
      return "authenticated";
    },
    sessionLogout: () => {
      session.signedIn = false;
      session.pending = false;
      return "null";
    },
    systemGetInformation: guarded(
      user
        ? "user"
        : name === "pendingChanges"
          ? "adminPendingChanges"
          : "admin",
    ),
    userMgmtGetUserByContext: guarded("user"),
    webGuiGetAutoLogoutSettings: guarded(
      name === "idleWarning" ? ONE_MINUTE : user ? "user" : "admin",
    ),
    configIsDirty: guarded(name === "pendingChanges" ? "dirty" : "clean"),
    configApplyChangesBg: guarded("applied"),
    configRevertChangesBg: guarded("reverted"),
    execGetOutput: guarded("appliedFinished"),
    execIsRunning: guarded("running"),
    execStop: guarded("null"),
    sshGet: guarded("defaults"),
    sshSet: guarded("saved"),
    shareMgmtGetList: guarded("populated"),
  };
}
