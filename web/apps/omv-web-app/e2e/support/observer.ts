// SPDX-License-Identifier: GPL-3.0-or-later
// The violation observer both browser tests share (the mock one in this directory and the VM one in
// ../vm): every CSP violation (enforced or report-only, Trusted Types included), console error,
// uncaught page error and request to another origin. Any of them fails the test, except the console
// errors a caller lists as allowed, each with the reason a real reply causes it.
import { expect, type ConsoleMessage, type Page } from "@playwright/test";

export interface Observed {
  violations: string[];
  consoleErrors: string[];
  pageErrors: string[];
  foreignRequests: string[];
}

/** A console error the page is allowed to log, and why. */
export interface ConsoleAllowance {
  /** Why a real or mocked reply legitimately causes it; shown nowhere, kept for the reader. */
  reason: string;
  matches: (message: ConsoleMessage, origin: string) => boolean;
}

/** The name the page reports violations through; set up before any of the page's own scripts. */
const BINDING = "__omvReportViolation";

/**
 * Chromium logs every 4xx reply as a console error. A 401 from rpc.php is the answer to the
 * load-time probe while signed out (docs/03 "Login"), and to a background check after the session
 * ended; nothing else is let through by this allowance.
 */
export const RPC_401: ConsoleAllowance = {
  reason: "rpc.php answers 401 while signed out (the load-time probe)",
  matches: (message, origin) =>
    message.location().url === `${origin}/rpc.php` &&
    message
      .text()
      .startsWith(
        "Failed to load resource: the server responded with a status of 401",
      ),
};

/**
 * A 404 from rpc.php is OMV's answer for a service it does not know: a plugin that is not installed.
 * The shell asks once after sign-in whether the ZFS plugin is (Zfs.listCompressionTypes, ZFS design
 * 0.11), and the mock's stories without ZFS answer it, and any other Zfs call, as OMV would. The
 * console line cannot say which call it was, but no other 404 goes unnoticed: a method the mock does
 * not know is also recorded in the mock's problems, which fails the test (fixtures.ts).
 */
export const RPC_404_NO_PLUGIN: ConsoleAllowance = {
  reason:
    "rpc.php answers 404 for a plugin that is not installed (the menu's probe)",
  matches: (message, origin) =>
    message.location().url === `${origin}/rpc.php` &&
    message
      .text()
      .startsWith(
        "Failed to load resource: the server responded with a status of 404",
      ),
};

/**
 * Over plain HTTP, Chromium ignores the snippet's Cross-Origin-Opener-Policy and logs it as an error
 * for each document: COOP applies only on a potentially trustworthy origin (HTTPS or localhost; the
 * mock browser test serves from 127.0.0.1, which is). The header is still right to send:
 * it takes effect as soon as the same page is served over HTTPS. Allowed for an http: origin only:
 * the VM over HTTP, and the mock browser test when a page is opened at a network story's address
 * (fixtures.ts, `openedAt`).
 */
export const COOP_IGNORED_OVER_HTTP: ConsoleAllowance = {
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

/** Start observing `page`, served from `origin`. Call before the first navigation. */
export async function observe(
  page: Page,
  origin: string,
  allowed: readonly ConsoleAllowance[],
): Promise<Observed> {
  const observed: Observed = {
    violations: [],
    consoleErrors: [],
    pageErrors: [],
    foreignRequests: [],
  };
  await page.exposeBinding(BINDING, (_source, summary: unknown) => {
    observed.violations.push(String(summary));
  });
  await page.addInitScript((binding: string) => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report: unknown = Reflect.get(window, binding);
      if (typeof report === "function") {
        report(
          `${event.disposition} ${event.effectiveDirective}: blocked ${event.blockedURI || "(inline)"}` +
            ` at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}` +
            (event.sample ? ` sample "${event.sample}"` : ""),
        );
      }
    });
  }, BINDING);
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !allowed.some((a) => a.matches(message, origin))
    ) {
      observed.consoleErrors.push(
        `${message.text()} (${message.location().url})`,
      );
    }
  });
  page.on("pageerror", (error) => {
    observed.pageErrors.push(`${error.name}: ${error.message}`);
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) {
      observed.foreignRequests.push(request.url());
    }
  });
  return observed;
}

/** Fail the test (softly, so every kind is reported) if anything was observed. */
export function expectNothingObserved(observed: Observed): void {
  expect.soft(observed.violations, "CSP violations").toEqual([]);
  expect.soft(observed.consoleErrors, "console errors").toEqual([]);
  expect.soft(observed.pageErrors, "uncaught page errors").toEqual([]);
  expect
    .soft(observed.foreignRequests, "requests to another origin (UI-7)")
    .toEqual([]);
}

/**
 * The canary: break the snippet's policy on purpose, in two ways it forbids, so a clean run of the
 * other tests is evidence and not silence. A script's text assigned from a plain string is refused by
 * Trusted Types (`require-trusted-types-for 'script'`), and an inline style element is refused by
 * `style-src 'self'`. Each must come back as an enforced violation.
 */
export const CANARY_VIOLATIONS: readonly RegExp[] = [
  /^enforce require-trusted-types-for:/,
  /^enforce style-src-elem: blocked inline/,
];

export async function breakThePolicy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const script = document.createElement("script");
    try {
      script.textContent = "void 0";
      document.head.append(script);
    } catch {
      // Trusted Types threw on the assignment; the violation event has been sent.
    }
    const style = document.createElement("style");
    style.textContent = "body { outline: 0 }";
    document.head.append(style);
    style.remove();
  });
}
