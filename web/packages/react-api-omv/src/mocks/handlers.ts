// SPDX-License-Identifier: GPL-3.0-or-later
// MSW handlers that answer rpc.php from the contract's examples (docs/04, "Examples are evidence,
// and they are the mocks"). They hold no state: a write answers with its example and changes
// nothing a later read returns. Development and test code only; a production build never imports
// this module (UI-11).
import { http, HttpResponse } from "msw";
import { OPERATIONS } from "../contract/generated/operations.ts";
import type { OperationEntry } from "../contract/types.ts";
import {
  CONTRACT_EXAMPLES,
  DEFAULT_EXAMPLE,
} from "../examples/generated/examples.ts";

export type OperationId = keyof typeof CONTRACT_EXAMPLES;
export type ExampleName<Op extends OperationId> =
  keyof (typeof CONTRACT_EXAMPLES)[Op] & string;

/** A reply written out: the HTTP status and, for 200, the response value or else the error. */
export interface FixedAnswer {
  status: number;
  /** The `response` for 200; for any other status the `error`'s message (and optional code). */
  value?: unknown;
  message?: string;
  code?: number;
  /**
   * A body that is not JSON, sent as it is with this status instead of the envelope. PHP answers a
   * script it stopped (a fatal error such as running out of memory) with 500 and an empty body.
   */
  rawBody?: string;
  /**
   * No reply at all: the request fails as it does when the NAS cannot be reached (the browser's fetch
   * rejects, the transport's `network` kind). The status is then not used.
   */
  networkError?: true;
}

/** What the mock answers for one operation: a named example, a written reply, or a function of the call. */
export type Answer<Op extends OperationId = OperationId> =
  | ExampleName<Op>
  | FixedAnswer
  | ((call: {
      params: unknown;
      options: unknown;
    }) => ExampleName<Op> | FixedAnswer);

export type Answers = { [Op in OperationId]?: Answer<Op> };

/** Every error reply carries a trace, as OMV's do (A8), so tests can prove it never surfaces. */
export const MOCK_TRACE =
  "#0 /usr/share/php/openmediavault/mock.inc(1): mock trace (must never be shown)";

const byServiceMethod = new Map<string, OperationEntry>(
  Object.values(OPERATIONS).map((e) => [`${e.service}.${e.method}`, e]),
);

function exampleAnswer(operationId: OperationId, name: string): FixedAnswer {
  const examples = CONTRACT_EXAMPLES[operationId] as Record<
    string,
    { status: number; value: unknown }
  >;
  const example = examples[name];
  if (!example) {
    throw new Error(
      `No example "${name}" for ${operationId}. Known: ${Object.keys(examples).join(", ")}`,
    );
  }
  if (example.status === 200) {
    return { status: 200, value: example.value };
  }
  const error = example.value as { code?: number | null; message?: string };
  return {
    status: example.status,
    message: error.message ?? "",
    code: error.code ?? 0,
  };
}

export function replyOf(answer: FixedAnswer) {
  if (answer.networkError === true) {
    return HttpResponse.error();
  }
  if (answer.rawBody !== undefined) {
    return new HttpResponse(answer.rawBody, {
      status: answer.status,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }
  if (answer.status === 200) {
    return HttpResponse.json(
      { response: answer.value ?? null, error: null },
      { status: 200 },
    );
  }
  return HttpResponse.json(
    {
      response: null,
      error: {
        code: answer.code ?? 0,
        message: answer.message ?? "",
        trace: MOCK_TRACE,
      },
    },
    { status: answer.status },
  );
}

/**
 * One handler for POST /rpc.php: it reads `service` and `method`, finds the operation in the
 * contract, and answers with the chosen example, or the operation's default example. A call to a
 * method the contract does not describe gets the reply OMV gives an unknown method, and an error in
 * the console, so a test notices.
 */
export function createRpcHandlers(answers: Answers = {}) {
  return [
    http.post("*/rpc.php", async ({ request }) => {
      let body: {
        service?: unknown;
        method?: unknown;
        params?: unknown;
        options?: unknown;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return replyOf({
          status: 500,
          message: "Failed to get the RPC parameters.",
        });
      }
      const entry = byServiceMethod.get(
        `${String(body.service)}.${String(body.method)}`,
      );
      if (!entry) {
        console.error(
          `[mock] rpc.php was called with a method the contract does not describe`,
        );
        return replyOf({
          status: 404,
          message: "The method does not exist for the RPC service.",
        });
      }
      const operationId = entry.operationId as OperationId;
      const chosen = (answers as Record<string, Answer | undefined>)[
        operationId
      ];
      const resolved =
        typeof chosen === "function"
          ? chosen({ params: body.params, options: body.options })
          : chosen;
      const answer =
        resolved === undefined
          ? exampleAnswer(operationId, DEFAULT_EXAMPLE[operationId])
          : typeof resolved === "string"
            ? exampleAnswer(operationId, resolved)
            : resolved;
      return replyOf(answer);
    }),
  ];
}

/** The example names of an operation, the default first. */
export function exampleNames<Op extends OperationId>(
  operationId: Op,
): ExampleName<Op>[] {
  const names = Object.keys(
    CONTRACT_EXAMPLES[operationId],
  ) as ExampleName<Op>[];
  const first = DEFAULT_EXAMPLE[operationId] as unknown as ExampleName<Op>;
  return [first, ...names.filter((n) => n !== first)];
}
