// SPDX-License-Identifier: GPL-3.0-or-later
// The transport against the mock: request shape (UI-10), unknown operations (UI-4), errors and
// traces (UI-9), the session ending, normalisation, the Session fields it drops (UI-3, UI-6), and the
// fields the contract omits (x-omv-omit, UI-6), at the top level and in every row.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CONTRACT_EXAMPLES } from "../examples/generated/examples.ts";
import {
  configApplyChangesBg,
  configIsDirty,
} from "../generated/omv/config/config.ts";
import { emailNotificationGet } from "../generated/omv/email-notification/email-notification.ts";
import { execGetOutput, execStop } from "../generated/omv/exec/exec.ts";
import { networkEnumerateDevicesList } from "../generated/omv/network/network.ts";
import { sessionLogin } from "../generated/omv/session/session.ts";
import { shareMgmtGetList } from "../generated/omv/share-mgmt/share-mgmt.ts";
import { sshSet } from "../generated/omv/ssh/ssh.ts";
import { systemGetInformation } from "../generated/omv/system/system.ts";
import { userMgmtSetUserByContext } from "../generated/omv/user-mgmt/user-mgmt.ts";
import {
  createRpcHandlers,
  MOCK_TRACE,
  type Answers,
} from "../mocks/handlers.ts";
import { RpcError } from "./RpcError.ts";
import {
  onActivity,
  onPendingChanges,
  onSessionEnded,
  rpcClient,
} from "./rpcClient.ts";

const server = setupServer();
const seen: {
  url: string;
  method: string;
  contentType: string | null;
  body: unknown;
}[] = [];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", async ({ request }) => {
    seen.push({
      url: new URL(request.url).pathname,
      method: request.method,
      contentType: request.headers.get("content-type"),
      body: await request.clone().json(),
    });
  });
});
afterEach(() => {
  server.resetHandlers();
  seen.length = 0;
});
afterAll(() => server.close());

const answer = (answers: Answers = {}) =>
  server.use(...createRpcHandlers(answers));
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("requests", () => {
  it("POSTs JSON to the fixed endpoint with service, method and params (UI-10)", async () => {
    answer();
    await shareMgmtGetList({ start: 0, limit: 25 });
    await settle();
    expect(seen).toEqual([
      {
        url: "/rpc.php",
        method: "POST",
        contentType: "application/json",
        body: {
          service: "ShareMgmt",
          method: "getList",
          params: { start: 0, limit: 25 },
        },
      },
    ]);
  });

  it("sends {} when an operation has no parameters (A2)", async () => {
    answer();
    await systemGetInformation();
    await settle();
    expect(seen[0]?.body).toEqual({
      service: "System",
      method: "getInformation",
      params: {},
    });
  });

  it("marks a background call so it does not extend the session (UI-14)", async () => {
    answer();
    await configIsDirty(undefined, { background: true });
    await settle();
    expect(seen[0]?.body).toEqual({
      service: "Config",
      method: "isDirty",
      params: {},
      options: { updatelastaccess: false },
    });
  });

  it("refuses a url that is not in the operation table, before any request (UI-4)", async () => {
    answer();
    await expect(
      rpcClient({ url: "/rpc/FileBrowser/get", method: "POST" }),
    ).rejects.toThrow(/Not an operation/);
    await expect(
      rpcClient({ url: "/rpc.php", method: "POST" }),
    ).rejects.toThrow(/Not an operation/);
    await expect(
      rpcClient({ url: "toString", method: "POST" }),
    ).rejects.toThrow(/Not an operation/);
    await settle();
    expect(seen).toEqual([]);
  });

  it("refuses anything but POST", async () => {
    await expect(
      rpcClient({ url: "/rpc/SSH/get", method: "GET" }),
    ).rejects.toThrow(/POST/);
    expect(seen).toEqual([]);
  });
});

describe("errors", () => {
  it("throws an RpcError with status, code and message, and never the trace (UI-9)", async () => {
    answer({ sessionLogin: "wrongPassword" });
    const error = await sessionLogin({
      username: "example-user",
      password: "x",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect(error).toMatchObject({
      status: 400,
      code: 0,
      message: "Incorrect username or password.",
      operationId: "sessionLogin",
      kind: "rejected",
    });
    const everything = JSON.stringify(error, Object.getOwnPropertyNames(error));
    expect(everything).not.toContain("mock trace");
    expect(everything).not.toContain(MOCK_TRACE);
  });

  it.each([
    [401, "Session not authenticated.", "session"],
    [403, "Invalid context role.", "forbidden"],
    [
      429,
      "Too many failed verification attempts. Please try again later.",
      "tooManyAttempts",
    ],
    [500, "Please apply the configuration changes first.", "configDirty"],
    [500, "Failed to open file", "failure"],
  ])("classifies HTTP %i", async (status, message, kind) => {
    answer({ systemGetInformation: { status, message } });
    await expect(systemGetInformation()).rejects.toMatchObject({
      status,
      message,
      kind,
    });
  });

  it("turns a network failure into status 0", async () => {
    server.use(http.post("*/rpc.php", () => HttpResponse.error()));
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 0,
      kind: "network",
    });
  });

  it("turns a reply that is not JSON into a generic error", async () => {
    server.use(
      http.post(
        "*/rpc.php",
        () => new HttpResponse("<html>Bad Gateway</html>", { status: 502 }),
      ),
    );
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 502,
      message: "The server sent a reply that could not be read.",
    });
  });

  it("treats a 200 with an error member as a failure", async () => {
    server.use(
      http.post("*/rpc.php", () =>
        HttpResponse.json({
          response: null,
          error: { code: 0, message: "No." },
        }),
      ),
    );
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 500,
      message: "No.",
    });
  });
});

describe("the session ending", () => {
  it("notifies once for a run of 401s, and again after a successful call", async () => {
    answer();
    await systemGetInformation();
    server.resetHandlers();
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    answer({
      systemGetInformation: { status: 401, message: "Session expired." },
    });
    await systemGetInformation().catch(() => undefined);
    await systemGetInformation().catch(() => undefined);
    expect(ended).toHaveBeenCalledTimes(1);
    server.resetHandlers();
    answer();
    await systemGetInformation();
    server.resetHandlers();
    answer({
      systemGetInformation: {
        status: 401,
        message: "Session not authenticated.",
      },
    });
    await systemGetInformation().catch(() => undefined);
    expect(ended).toHaveBeenCalledTimes(2);
    off();
  });
});

describe("activity on the session (the idle clock, UI-14)", () => {
  it("reports each foreground call the server answered, with the time it was sent", async () => {
    answer({ sessionLogin: "wrongPassword" });
    const activity = vi.fn();
    const off = onActivity(activity);
    const before = Date.now();
    await systemGetInformation();
    // A refused call still refreshed the session on the server: rpc.php counts it before the method runs.
    await sessionLogin({ username: "example-user", password: "x" }).catch(
      () => undefined,
    );
    expect(activity).toHaveBeenCalledTimes(2);
    const [sentAt] = activity.mock.calls[0] as [number];
    expect(sentAt).toBeGreaterThanOrEqual(before);
    expect(sentAt).toBeLessThanOrEqual(Date.now());
    off();
  });

  it("does not report a background call, a 401 or a network failure", async () => {
    const activity = vi.fn();
    const off = onActivity(activity);
    answer();
    await configIsDirty(undefined, { background: true });
    server.resetHandlers();
    answer({
      systemGetInformation: { status: 401, message: "Session expired." },
    });
    await systemGetInformation().catch(() => undefined);
    server.resetHandlers();
    server.use(http.post("*/rpc.php", () => HttpResponse.error()));
    await systemGetInformation().catch(() => undefined);
    expect(activity).not.toHaveBeenCalled();
    off();
  });
});

describe("replies", () => {
  it("turns PHP's [] for an empty map into {}", async () => {
    answer({ systemGetInformation: "admin" });
    const info = await systemGetInformation();
    expect(info.dirtyModules).toEqual({});
  });

  it("passes fields the contract does not list through (open responses)", async () => {
    answer({
      systemGetInformation: {
        status: 200,
        value: { ts: 1, time: "t", hostname: "nas", addedByAPlugin: 7 },
      },
    });
    expect(await systemGetInformation()).toMatchObject({ addedByAPlugin: 7 });
  });

  it("drops sessionid from the login reply (UI-6) and redirecturl from a challenge (UI-3)", async () => {
    answer({ sessionLogin: "authenticated" });
    const signedIn = await sessionLogin({
      username: "example-admin",
      password: "x",
    });
    expect(Object.keys(signedIn).sort()).toEqual([
      "permissions",
      "status",
      "username",
    ]);
    server.resetHandlers();
    answer({ sessionLogin: "challengeRequired" });
    const challenged = await sessionLogin({
      username: "example-2fa",
      password: "x",
    });
    expect(challenged).toEqual({
      status: "challengeRequired",
      username: "example-2fa",
      challenge: { kind: "totp" },
    });
    expect(JSON.stringify(challenged)).not.toContain("tfatotp");
  });

  it("reports a reply that does not match the contract in development builds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    answer({
      systemGetInformation: {
        status: 200,
        value: { ts: "not a number", time: "t", hostname: "nas" },
      },
    });
    await systemGetInformation();
    expect(warn).toHaveBeenCalledWith(
      "[contract] systemGetInformation: the reply does not match the contract",
      ["$.ts: expected integer, got string"],
    );
  });

  it("announces pending changes after an operation marked x-omv-dirty, and only then", async () => {
    const pending = vi.fn();
    const off = onPendingChanges(pending);
    answer();
    await systemGetInformation();
    expect(pending).not.toHaveBeenCalled();
    await sshSet({
      enable: true,
      port: 22,
      passwordauthentication: true,
      pubkeyauthentication: true,
      permitrootlogin: false,
      tcpforwarding: false,
      compression: false,
      extraoptions: "",
    });
    expect(pending).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("task handles (UI-5)", () => {
  it("calls Exec only with a handle a task-starting call returned", async () => {
    answer();
    await expect(
      execGetOutput({ filename: "/tmp/bgstatusForged", pos: 0 }),
    ).rejects.toThrow(/handle/);
    await expect(execStop({ filename: "/etc/passwd" })).rejects.toThrow(
      /handle/,
    );
    await settle();
    expect(seen).toEqual([]);

    const handle = await configApplyChangesBg({ modules: [], force: false });
    answer({
      execGetOutput: {
        status: 200,
        value: {
          filename: handle,
          pos: 2,
          output: "[]",
          pendingOutput: false,
          running: false,
        },
      },
    });
    await execGetOutput({ filename: handle, pos: 0 });
    // The server deletes a finished task; the handle is forgotten with it.
    await expect(execGetOutput({ filename: handle, pos: 2 })).rejects.toThrow(
      /handle/,
    );
  });
});

describe("fields the contract omits (x-omv-omit, UI-6)", () => {
  // A value no example contains, so finding it anywhere means the strip failed.
  const SECRET = "not-a-real-smtp-password-7f3a";

  it.each([
    {
      name: "EmailNotification.get, configured",
      call: () => emailNotificationGet(),
      answers: { emailNotificationGet: "configured" } satisfies Answers,
      raw: CONTRACT_EXAMPLES.emailNotificationGet.configured.value,
    },
    {
      name: "EmailNotification.get, not configured",
      call: () => emailNotificationGet(),
      answers: { emailNotificationGet: "notConfigured" } satisfies Answers,
      raw: CONTRACT_EXAMPLES.emailNotificationGet.notConfigured.value,
    },
    {
      name: "UserMgmt.setUserByContext",
      call: () => userMgmtSetUserByContext({ email: "", comment: "" }),
      answers: { userMgmtSetUserByContext: "saved" } satisfies Answers,
      raw: CONTRACT_EXAMPLES.userMgmtSetUserByContext.saved.value,
    },
  ])(
    "$name: the server's reply carries password, the caller never gets it",
    async ({ call, answers, raw }) => {
      expect(raw).toHaveProperty("password");
      answer(answers);
      const value: object = await call();
      expect(value).not.toHaveProperty("password");
      const { password: _dropped, ...rest } = raw;
      expect(value).toEqual(rest);
    },
  );

  it("removes the field before validation, so a mismatch report never carries it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    answer({
      emailNotificationGet: {
        status: 200,
        value: {
          ...CONTRACT_EXAMPLES.emailNotificationGet.configured.value,
          port: "587",
          password: SECRET,
        },
      },
    });
    const value = await emailNotificationGet();
    expect(warn).toHaveBeenCalledWith(
      "[contract] emailNotificationGet: the reply does not match the contract",
      ["$.port: expected integer, got string"],
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(value)).not.toContain(SECRET);
  });

  it.each([
    {
      name: "a reply without the field",
      value: { enable: false },
      want: { enable: false },
    },
    { name: "PHP's [] for an empty map", value: [], want: {} },
    {
      name: "only the named field",
      value: { password: SECRET, passwordHint: "kept", username: "u" },
      want: { passwordHint: "kept", username: "u" },
    },
  ])("handles $name", async ({ value, want }) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    answer({ emailNotificationGet: { status: 200, value } });
    expect(await emailNotificationGet()).toEqual(want);
  });

  it.each([
    { name: "the captured interfaces", example: "ethernetAndLoopback" },
    { name: "a configured Wi-Fi interface", example: "wifi" },
  ] as const)(
    "Network.enumerateDevicesList, $name: no row keeps the Wi-Fi key",
    async ({ example }) => {
      const raw = CONTRACT_EXAMPLES.networkEnumerateDevicesList[example].value;
      answer({ networkEnumerateDevicesList: example });
      const value = await networkEnumerateDevicesList({
        start: 0,
        limit: null,
      });
      expect(value.data).toHaveLength(raw.data.length);
      for (const [i, row] of value.data.entries()) {
        expect(row).not.toHaveProperty("wpapsk");
        const { wpapsk: _dropped, ...rest } = raw.data[i] as Record<
          string,
          unknown
        >;
        expect(row).toEqual({
          ...rest,
          // The transport normalises PHP's [] for an empty map.
          ...(Array.isArray(rest.stats) && { stats: {} }),
        });
      }
    },
  );

  it("removes the Wi-Fi key from every row, whatever its value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rows = CONTRACT_EXAMPLES.networkEnumerateDevicesList.wifi.value.data;
    answer({
      networkEnumerateDevicesList: {
        status: 200,
        value: {
          total: rows.length,
          // A wrong type elsewhere, so the mismatch report runs and is checked too.
          data: rows.map((row) => ({ ...row, wpapsk: SECRET, speed: "fast" })),
        },
      },
    });
    const value = await networkEnumerateDevicesList({ start: 0, limit: null });
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(value)).not.toContain(SECRET);
  });

  it("leaves a field of that name alone where the contract does not omit it", async () => {
    answer({
      systemGetInformation: {
        status: 200,
        value: { ts: 1, time: "t", hostname: "nas", password: "plugin-field" },
      },
    });
    expect(await systemGetInformation()).toHaveProperty(
      "password",
      "plugin-field",
    );
  });
});
