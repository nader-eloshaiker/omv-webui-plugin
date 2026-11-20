// SPDX-License-Identifier: GPL-3.0-or-later
// The VM browser test's fixtures. The app is the build deployed on the test VM, served by the VM's
// nginx through the plugin's snippet, and talks to the VM's real rpc.php.
// - `headerVariant` (per project): the VM's headers as they are, or with
//   `require-trusted-types-for 'script'` added to the policy of every document and asset reply,
//   rewritten in the browser by route interception (A9, Phase 2 acceptance).
// - `rpcLog` (per test, automatic): which `Service.method` the page called, in order, and the replies
//   of a few reads the test compares with the screen. Parameters are never kept: they carry
//   passwords and codes.
// - `observed` (per test, automatic): the shared violation observer (../../support/observer.ts),
//   with only the console errors listed in VM_ALLOWANCES let through.
import { test as base, expect, type Page, type Route } from "@playwright/test";
import {
  expectNothingObserved,
  observe,
  RPC_401,
  type ConsoleAllowance,
  type Observed,
} from "../../support/observer.ts";
import { withTrustedTypes } from "../../support/snippetServer.ts";
import { readVmTarget, type VmTarget } from "./vmTarget.ts";

export type VmHeaderVariant = "vm" | "trustedTypesEnforced";

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

/** What the Trusted Types rewrite did: every reply under /ui/ it rewrote, and any it could not. */
interface Rewrites {
  rewritten: string[];
  withoutPolicy: string[];
}

async function enforceTrustedTypes(
  page: Page,
  origin: string,
): Promise<Rewrites> {
  const rewrites: Rewrites = { rewritten: [], withoutPolicy: [] };
  const handler = async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch({ maxRedirects: 0 });
    // The body arrives decoded; its encoding and length headers no longer describe it.
    const {
      "content-encoding": _encoding,
      "content-length": _length,
      ...headers
    } = response.headers();
    const path = new URL(route.request().url()).pathname;
    const policy = headers["content-security-policy"];
    if (policy === undefined) {
      rewrites.withoutPolicy.push(path);
      await route.fulfill({ response, headers });
      return;
    }
    rewrites.rewritten.push(path);
    await route.fulfill({
      response,
      headers: {
        ...headers,
        "content-security-policy": withTrustedTypes(policy),
      },
    });
  };
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith("/ui/"),
    handler,
  );
  return rewrites;
}

interface WorkerFixtures {
  headerVariant: VmHeaderVariant;
  vm: VmTarget;
}

interface TestFixtures {
  rpcLog: RpcLog;
  observed: Observed;
  trustedTypes: Rewrites | null;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  headerVariant: ["vm", { option: true, scope: "worker" }],

  vm: [
    async ({ headerVariant: _variant }, provide) => {
      if (target === null) {
        throw new Error("The VM suite runs only with an env file.");
      }
      await provide(target);
    },
    { scope: "worker" },
  ],

  trustedTypes: [
    async ({ page, vm, headerVariant }, provide) => {
      if (headerVariant === "vm") {
        await provide(null);
        return;
      }
      const rewrites = await enforceTrustedTypes(page, vm.origin);
      await provide(rewrites);
      expect
        .soft(rewrites.withoutPolicy, "replies under /ui/ without a CSP")
        .toEqual([]);
    },
    { auto: true },
  ],

  rpcLog: [
    async ({ page, vm }, provide) => {
      const log = new RpcLog();
      log.attach(page, vm.origin);
      await provide(log);
    },
    { auto: true },
  ],

  observed: [
    async ({ page, vm }, provide) => {
      const observed = await observe(page, vm.origin, VM_ALLOWANCES);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

export { expect };
