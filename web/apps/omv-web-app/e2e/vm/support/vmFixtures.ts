// SPDX-License-Identifier: GPL-3.0-or-later
// The VM browser test's fixtures. The app is the build deployed on the test VM, served by the VM's
// nginx through the plugin's snippet (whose policy enforces Trusted Types, UI-1), and talks to the VM's
// real rpc.php. Nothing rewrites a reply: the page gets exactly what nginx sends.
// - `vm` (per worker): the target and its accounts (vmTarget.ts).
// - `rpcLog` (per test, automatic): which `Service.method` the page called, in order, and the replies
//   of a few reads the test compares with the screen. Parameters are never kept: they carry
//   passwords and codes.
// - `observed` (per test, automatic): the shared violation observer (../../support/observer.ts),
//   with only the console errors listed in VM_ALLOWANCES let through.
import { test as base, expect, type Page } from "@playwright/test";
import {
  expectNothingObserved,
  observe,
  RPC_401,
  type ConsoleAllowance,
  type Observed,
} from "../../support/observer.ts";
import { readVmTarget, type VmTarget } from "./vmTarget.ts";

/** The target, or null without an env file; read once, when the suite loads. */
export const target: VmTarget | null = readVmTarget();

/**
 * Over plain HTTP, Chromium ignores the snippet's Cross-Origin-Opener-Policy and logs it as an error
 * for each document: COOP applies only on a potentially trustworthy origin (HTTPS or localhost; the
 * mock browser test serves from 127.0.0.1, so it never sees this). The header is still right to send:
 * it takes effect as soon as the same page is served over HTTPS. Allowed for an http: origin only.
 */
const COOP_IGNORED_OVER_HTTP: ConsoleAllowance = {
  reason: "COOP is ignored on an http: origin (not potentially trustworthy)",
  matches: (message, origin) =>
    origin.startsWith("http:") &&
    message.location().url.startsWith(`${origin}/ui/`) &&
    message
      .text()
      .startsWith(
        "The Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy.",
      ),
};

/**
 * The console errors a real backend legitimately causes; nothing else is let through.
 * - RPC_401: signed out, the load-time probe (System.getInformation and UserMgmt.getUserByContext)
 *   gets 401 "Session not authenticated." (A3), which Chromium logs as a failed resource.
 * - COOP_IGNORED_OVER_HTTP: the VM is reached over plain HTTP (above).
 */
export const VM_ALLOWANCES: readonly ConsoleAllowance[] = [
  RPC_401,
  COOP_IGNORED_OVER_HTTP,
];

/** The reads whose replies the test keeps, to compare with what the page shows. */
const KEPT_REPLIES = new Set([
  "System.getInformation",
  "UserMgmt.getUserByContext",
  "WebGui.getAutoLogoutSettings",
  "SSH.get",
]);

function callName(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const service: unknown = Reflect.get(body, "service");
    const method: unknown = Reflect.get(body, "method");
    if (typeof service === "string" && typeof method === "string") {
      return `${service}.${method}`;
    }
  }
  return "(not an RPC call)";
}

/** The calls the page made to rpc.php, by name, and the kept replies. */
export class RpcLog {
  readonly calls: string[] = [];
  readonly #replies = new Map<string, unknown>();

  attach(page: Page, origin: string): void {
    const endpoint = `${origin}/rpc.php`;
    page.on("request", (request) => {
      if (request.url() === endpoint) {
        this.calls.push(callName(request.postDataJSON()));
      }
    });
    page.on("response", async (response) => {
      if (response.url() !== endpoint || response.status() !== 200) {
        return;
      }
      const name = callName(response.request().postDataJSON());
      if (!KEPT_REPLIES.has(name)) {
        return;
      }
      try {
        const envelope: unknown = await response.json();
        if (typeof envelope === "object" && envelope !== null) {
          this.#replies.set(name, Reflect.get(envelope, "response"));
        }
      } catch {
        // The page was closed before the body arrived: the test that needed it fails on `reply`.
      }
    });
  }

  /** The last reply of a kept read, once it has arrived. */
  async reply(name: string): Promise<unknown> {
    await expect
      .poll(() => this.#replies.has(name), { message: `a reply to ${name}` })
      .toBe(true);
    return this.#replies.get(name);
  }

  /** The calls made after the first call named `from`, up to and not including the first `to`. */
  between(from: string, to: string): string[] {
    const start = this.calls.indexOf(from);
    const end = this.calls.indexOf(to, start + 1);
    if (start < 0 || end < 0) {
      throw new Error(`${from} then ${to} were not both called.`);
    }
    return this.calls.slice(start + 1, end);
  }
}

interface WorkerFixtures {
  vm: VmTarget;
}

interface TestFixtures {
  rpcLog: RpcLog;
  observed: Observed;
  /**
   * Console errors a spec expects on top of VM_ALLOWANCES, each with its reason (`test.use`). Chromium
   * logs a 4xx or 5xx reply without saying which method it answered, so a spec that allows one also
   * checks the replies themselves (the disks pages: the RAID plugin's 404, the "no settings" 500).
   */
  extraAllowances: readonly ConsoleAllowance[];
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  vm: [
    async ({ browserName: _browser }, provide) => {
      if (target === null) {
        throw new Error("The VM suite runs only with an env file.");
      }
      await provide(target);
    },
    { scope: "worker" },
  ],

  rpcLog: [
    async ({ page, vm }, provide) => {
      const log = new RpcLog();
      log.attach(page, vm.origin);
      await provide(log);
    },
    { auto: true },
  ],

  extraAllowances: [[], { option: true }],

  observed: [
    async ({ page, vm, extraAllowances }, provide) => {
      const observed = await observe(page, vm.origin, [
        ...VM_ALLOWANCES,
        ...extraAllowances,
      ]);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

export { expect };
