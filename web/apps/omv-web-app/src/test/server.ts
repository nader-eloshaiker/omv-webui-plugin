// SPDX-License-Identifier: GPL-3.0-or-later
// The one network boundary of the app's tests: an MSW server answering rpc.php with the contract's
// examples (@omv-webui/react-api-omv/mocks). A request no handler answers is let through to the
// network guard, which refuses it and fails the test (setup.ts).
import {
  createRpcHandlers,
  type Answers,
} from "@omv-webui/react-api-omv/mocks";
import { setupServer } from "msw/node";

export const server = setupServer();

/** One rpc.php call as the server saw it: `Service.method`, and whether it was a background call. */
export interface SeenCall {
  call: string;
  params: unknown;
  background: boolean;
}

/** Every rpc.php call of the running test, in order. Emptied after each test. */
export const seenCalls: SeenCall[] = [];

server.events.on("request:start", async ({ request }) => {
  if (!request.url.endsWith("/rpc.php")) {
    return;
  }
  const body = (await request.clone().json()) as {
    service?: unknown;
    method?: unknown;
    params?: unknown;
    options?: { updatelastaccess?: unknown } | null;
  };
  seenCalls.push({
    call: `${String(body.service)}.${String(body.method)}`,
    params: body.params,
    background: body.options?.updatelastaccess === false,
  });
});

/** Answer rpc.php for this test: each operation's default example unless `answers` names another. */
export function answer(answers: Answers = {}): void {
  server.use(...createRpcHandlers(answers));
}

/** The calls made so far, as `Service.method`. */
export const callNames = (): string[] => seenCalls.map((c) => c.call);
