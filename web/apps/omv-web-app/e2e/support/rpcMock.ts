// SPDX-License-Identifier: GPL-3.0-or-later
// rpc.php for the browser test, answered in the browser by Playwright's route interception with the
// contract's examples. The production build carries no mock (UI-11): the replies never come from the
// bundle. Like OMV (A3, A10), everything outside Session answers 401 until a sign-in succeeds, and any
// other call while a second factor is awaited discards the pending sign-in.
import {
  CONTRACT_EXAMPLES,
  DEFAULT_EXAMPLE,
} from "@omv-webui/react-api-omv/examples";
import type { Page, Request, Route } from "@playwright/test";

type OperationId = keyof typeof CONTRACT_EXAMPLES;
type ExampleOf<Op extends OperationId> = keyof (typeof CONTRACT_EXAMPLES)[Op] &
  string;

/** How Session.login answers: signed in at once, or a second factor first. */
export type LoginExample = Extract<
  ExampleOf<"sessionLogin">,
  "authenticated" | "authenticatedUser" | "challengeRequired"
>;

interface Reply {
  status: number;
  body: unknown;
}

/** OMV's reply to a call without a session (A3, A8). */
const NOT_SIGNED_IN = { code: 0, message: "Session not authenticated." };
/** OMV's reply to a method it does not know. */
const UNKNOWN_METHOD = {
  code: 0,
  message: "The method does not exist for the RPC service.",
};
/** Every error carries a trace, as OMV's do; the transport must drop it (UI-9). */
const TRACE = "#0 mock trace for the browser test";

/** The handle the contract's apply example returns; the undo example returns another. */
const APPLY_HANDLE = CONTRACT_EXAMPLES.configApplyChangesBg.applied.value;

const isOperationId = (value: string): value is OperationId =>
  Object.hasOwn(CONTRACT_EXAMPLES, value);

/** `<service><Method>` in lower camel case: the contract's operationId rule (docs/04). */
const operationIdOf = (service: string, method: string) =>
  `${service.charAt(0).toLowerCase()}${service.slice(1)}${method.charAt(0).toUpperCase()}${method.slice(1)}`;

function exampleReply(operationId: OperationId, name: string): Reply {
  const examples: Readonly<
    Record<string, { status: number; value: unknown } | undefined>
  > = CONTRACT_EXAMPLES[operationId];
  const example = examples[name];
  if (!example) {
    throw new Error(`The contract has no example "${name}" for ${operationId}`);
  }
  return example.status === 200
    ? { status: 200, body: { response: example.value, error: null } }
    : errorReply(example.status, example.value);
}

function errorReply(status: number, error: unknown): Reply {
  const fields = typeof error === "object" && error !== null ? error : {};
  return {
    status,
    body: { response: null, error: { ...fields, trace: TRACE } },
  };
}

export class RpcMock {
  /** Every call, as `Service.method`, in order. */
  readonly calls: string[] = [];
  /** Requests that broke the transport's rules (UI-10) or named a method the contract lacks. */
  readonly problems: string[] = [];
  private login: LoginExample = "authenticated";
  private signedIn = false;
  private pending = false;
  /** Configuration changes are saved and not applied; a finished apply or undo clears them. */
  private dirty = false;

  /** The example Session.login answers with from now on. */
  loginWith(example: LoginExample): void {
    this.login = example;
  }

  /** Start with changes pending: System.getInformation and Config.isDirty say so until applied. */
  withPendingChanges(): void {
    this.dirty = true;
  }

  async install(page: Page, origin: string): Promise<void> {
    await page.route(`${origin}/rpc.php`, (route) => this.answer(route));
  }

  private async answer(route: Route): Promise<void> {
    const reply = this.replyTo(route.request());
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
    });
  }

  private replyTo(request: Request): Reply {
    if (request.method() !== "POST") {
      this.problems.push(`rpc.php called with ${request.method()} (UI-10)`);
    }
    if (!request.headers()["content-type"]?.startsWith("application/json")) {
      this.problems.push("rpc.php called without a JSON body (UI-10)");
    }
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    const call: object = typeof body === "object" && body !== null ? body : {};
    const { service, method } =
      typeof body === "object" && body !== null
        ? (body as { service?: unknown; method?: unknown })
        : {};
    if (typeof service !== "string" || typeof method !== "string") {
      this.problems.push("rpc.php called without a service and method");
      return errorReply(400, { code: 0, message: "Invalid RPC request." });
    }
    this.calls.push(`${service}.${method}`);
    const operationId = operationIdOf(service, method);
    if (!isOperationId(operationId)) {
      this.problems.push(
        `${service}.${method} is not in the contract's examples`,
      );
      return errorReply(404, UNKNOWN_METHOD);
    }
    switch (operationId) {
      case "sessionLogin": {
        const outcome = CONTRACT_EXAMPLES.sessionLogin[this.login].value.status;
        this.signedIn = outcome === "authenticated";
        this.pending = outcome === "challengeRequired";
        return exampleReply(operationId, this.login);
      }
      case "sessionVerify": {
        if (!this.pending) {
          return exampleReply(operationId, "noPendingLogin");
        }
        this.pending = false;
        this.signedIn = true;
        return exampleReply(operationId, "authenticated");
      }
      case "sessionLogout":
        this.signedIn = false;
        this.pending = false;
        return exampleReply(operationId, DEFAULT_EXAMPLE[operationId]);
      default:
        this.pending = false;
        if (!this.signedIn) {
          return errorReply(401, NOT_SIGNED_IN);
        }
        return this.signedInReply(operationId, call);
    }
  }

  /** The pending-changes path: what is pending, and the last poll of an apply or undo task. */
  private signedInReply(operationId: OperationId, body: object): Reply {
    switch (operationId) {
      case "systemGetInformation":
        return exampleReply(
          operationId,
          this.dirty ? "adminPendingChanges" : "admin",
        );
      case "configIsDirty":
        return exampleReply(operationId, this.dirty ? "dirty" : "clean");
      case "execGetOutput": {
        const { params } = body as { params?: { filename?: unknown } };
        this.dirty = false;
        return exampleReply(
          operationId,
          params?.filename === APPLY_HANDLE
            ? "appliedFinished"
            : "revertedFinished",
        );
      }
      default:
        return exampleReply(operationId, DEFAULT_EXAMPLE[operationId]);
    }
  }
}
