// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's scenarios: which of the contract's examples answer, for `pnpm dev:mock` and the tests.
// Development and test code only (UI-11); a production build never imports this module.
//
// The examples hold no state. The one thing tracked here is whether the mock session is signed in,
// so that a reload starts at sign-in and the screens of signing in can be walked: every operation
// outside Session answers 401 until Session.login (or verify) succeeds, and again after logout.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
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
  "applyFails",
  "idleWarning",
  "builtInAdmin",
  "checklistHidden",
  "alertsConfigured",
  "httpsOn",
  "attention",
  "noSharedFolders",
  "folderProblems",
  "readOnlyAccount",
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
  applyFails: "Administrator, applying fails",
  idleWarning: "Idle warning soon (1-minute timeout)",
  builtInAdmin: "Administrator signed in as admin",
  checklistHidden: "Administrator, set-up checklist hidden",
  alertsConfigured: "Administrator, email alerts set up",
  httpsOn: "Administrator, HTTPS on",
  attention: "Administrator, restart needed and clocks differ",
  noSharedFolders: "Administrator, no shared folders",
  folderProblems: "Administrator, shared folders that cannot be reached",
  readOnlyAccount: "Normal user, account locked",
};

/** The scenarios signed in as a normal user. */
const USER_SCENARIOS: readonly ScenarioName[] = ["user", "readOnlyAccount"];

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

// Replies written from the contract's examples for states no capture shows. Each changes only what
// its scenario is about; the rest is the captured example.
const LOGIN = CONTRACT_EXAMPLES.sessionLogin;
const INFO = CONTRACT_EXAMPLES.systemGetInformation;
const ACCOUNT = CONTRACT_EXAMPLES.userMgmtGetUserByContext.user.value;
const FOLDERS = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value;

/** The built-in administrator, whose password the factory one is. */
const BUILT_IN_ADMIN_LOGIN: FixedAnswer = {
  status: 200,
  value: { ...LOGIN.authenticated.value, username: "admin" },
};
const BUILT_IN_ADMIN_ACCOUNT: FixedAnswer = {
  status: 200,
  value: { ...ACCOUNT, name: "admin" },
};
/** An account the administrator has locked (OMV's "disallow user modification"). */
const LOCKED_ACCOUNT: FixedAnswer = {
  status: 200,
  value: { ...ACCOUNT, _readonly: true },
};

const FOLDER = FOLDERS.data[0];
/** Three folders that cannot be reached, one for each reason OMV reports, beside the healthy one. */
const PROBLEM_FOLDERS: FixedAnswer = {
  status: 200,
  value: {
    total: 4,
    data: [
      FOLDER,
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000011",
        name: "backups",
        comment: "",
        reldirpath: "backups/",
        absdirpath:
          "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/backups/",
        description: "backups",
        status: "ENOENT",
      },
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000012",
        name: "photos",
        comment: "",
        reldirpath: "photos",
        absdirpath:
          "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/photos",
        description: "photos",
        status: "ENOTDIR",
      },
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000013",
        name: "old-disk",
        comment: "",
        reldirpath: "old/",
        device: "",
        absdirpath: "",
        description: "old-disk",
        status: "ENOENT_DB_MNTENT",
      },
    ],
  },
};

/**
 * The examples were captured at a fixed moment, so their `ts` is in the past. The mock moves it to
 * now, so the dashboard's clock check compares like with like; the "attention" scenario keeps the
 * captured time, so the clocks differ.
 */
function information(
  example: keyof typeof INFO,
  change: { now: boolean; rebootRequired?: boolean },
): FixedAnswer {
  const { status, value } = INFO[example];
  if (status !== 200) {
    return { status, message: value.message };
  }
  return {
    status,
    value: {
      ...value,
      ...(change.now ? { ts: Math.floor(Date.now() / 1000) } : {}),
      ...(change.rebootRequired ? { rebootRequired: true } : {}),
    },
  };
}

/** The one folder matches a search for any of its words; anything else finds nothing (A2). */
function folderSearch(params: unknown): "populated" | "searchNoMatch" {
  const search = (params as { search?: unknown } | null)?.search;
  if (typeof search !== "string" || search === "") {
    return "populated";
  }
  return JSON.stringify(FOLDER).toLowerCase().includes(search.toLowerCase())
    ? "populated"
    : "searchNoMatch";
}

export interface MockSession {
  signedIn: boolean;
  /** A password was accepted and a second factor is awaited (A10). */
  pending: boolean;
  /** The next 401 says the session expired, as OMV's first answer after a timeout does. */
  expiring: boolean;
  /** Configuration changes are saved and not applied. A finished apply or undo clears it. */
  dirty: boolean;
  /** An administrator hid the set-up checklist (WebGui.dismissWelcomeMessage). */
  welcomeDismissed: boolean;
}

export const newMockSession = (
  signedIn = false,
  dirty = false,
): MockSession => ({
  signedIn,
  pending: false,
  expiring: false,
  dirty,
  welcomeDismissed: false,
});

/** Whether a scenario starts with changes pending. */
export const startsDirty = (name: ScenarioName): boolean =>
  name === "pendingChanges" || name === "applyFails";

// The handle the contract's apply example returns.
const APPLY_HANDLE = "/tmp/bgstatus7k6uanc46kul3JYrbbi";

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
  const user = USER_SCENARIOS.includes(name);
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
        case "readOnlyAccount":
          return "authenticatedUser";
        case "builtInAdmin":
          return BUILT_IN_ADMIN_LOGIN;
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
    systemGetInformation: () =>
      guarded<never>(
        information(
          user
            ? "user"
            : session.dirty
              ? "adminPendingChanges"
              : name === "checklistHidden" || session.welcomeDismissed
                ? "adminWelcomeDismissed"
                : "admin",
          {
            now: name !== "attention",
            rebootRequired: name === "attention",
          },
        ),
      )(),
    userMgmtGetUserByContext: guarded(
      name === "builtInAdmin"
        ? BUILT_IN_ADMIN_ACCOUNT
        : name === "readOnlyAccount"
          ? LOCKED_ACCOUNT
          : "user",
    ),
    webGuiGetAutoLogoutSettings: guarded(
      name === "idleWarning" ? ONE_MINUTE : user ? "user" : "admin",
    ),
    configIsDirty: () => guarded(session.dirty ? "dirty" : "clean")(),
    configApplyChangesBg: guarded("applied"),
    configRevertChangesBg: guarded("reverted"),
    // The last poll of a task: an apply that fails (A6: HTTP 500 with the Salt log), or a finished
    // apply or undo, after which nothing is pending.
    execGetOutput: ({ params }) => {
      const apply =
        (params as { filename?: unknown } | null)?.filename === APPLY_HANDLE;
      if (apply && name === "applyFails") {
        return guarded("applyFailed")();
      }
      const answer = guarded(apply ? "appliedFinished" : "revertedFinished")();
      if (typeof answer === "string") {
        session.dirty = false;
      }
      return answer;
    },
    execIsRunning: guarded("running"),
    execStop: guarded("null"),
    sshGet: guarded("defaults"),
    // Saving marks ssh and avahi dirty on OMV, so the band appears (Phase 1).
    sshSet: () => {
      const answer = guarded("saved")();
      if (answer === "saved") {
        session.dirty = true;
      }
      return answer;
    },
    shareMgmtGetList: ({ params }) =>
      guarded(
        name === "noSharedFolders"
          ? "empty"
          : name === "folderProblems"
            ? PROBLEM_FOLDERS
            : folderSearch(params),
      )(),
    webGuiGetSettings: guarded(name === "httpsOn" ? "https" : "http"),
    emailNotificationGet: guarded(
      name === "alertsConfigured" ? "configured" : "notConfigured",
    ),
    systemGetTimeSettings: guarded("defaults"),
    networkGetGeneralSettings: guarded("noDomain"),
    webGuiDismissWelcomeMessage: () => {
      const answer = guarded("null")();
      if (answer === "null") {
        session.welcomeDismissed = true;
      }
      return answer;
    },
    userMgmtSetUserByContext: guarded("saved"),
    userMgmtSetPasswordByContext: guarded("null"),
  };
}
