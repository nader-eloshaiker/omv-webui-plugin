// SPDX-License-Identifier: GPL-3.0-or-later
// rpc.php answered by one of the app's mock scenarios (src/mocks/scenarios.ts), in the browser test,
// for the calls a test names: the remembering file-system mock lets Flow A be walked in the production
// build. Everything else (sign-in above all) falls through to the shared RpcMock. Test code only; the
// production build carries no mock (UI-11).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import type { Page } from "@playwright/test";
import {
  newMockSession,
  scenarioAnswers,
  type ScenarioName,
} from "../../src/mocks/scenarios.ts";

const TRACE = "#0 mock trace for the browser test";

/** `<service><Method>` in lower camel case, the contract's operationId rule (docs/04). */
const operationIdOf = (service: string, method: string) =>
  `${service.replace(/^[A-Z]+(?![a-z])|^[A-Z]/, (head) => head.toLowerCase())}${method.charAt(0).toUpperCase()}${method.slice(1)}`;

type Resolved = string | FixedAnswer;

function replyOf(operationId: string, answer: Resolved) {
  if (typeof answer === "string") {
    const examples = CONTRACT_EXAMPLES[
      operationId as keyof typeof CONTRACT_EXAMPLES
    ] as Record<string, { status: number; value: unknown }>;
    const example = examples[answer];
    if (example === undefined) {
      throw new Error(`No example ${answer} for ${operationId}`);
    }
    return example.status === 200
      ? { status: 200, body: { response: example.value, error: null } }
      : {
          status: example.status,
          body: {
            response: null,
            error: { ...(example.value as object), trace: TRACE },
          },
        };
  }
  return answer.status === 200
    ? { status: 200, body: { response: answer.value ?? null, error: null } }
    : {
        status: answer.status,
        body: {
          response: null,
          error: {
            code: answer.code ?? 0,
            message: answer.message ?? "",
            trace: TRACE,
          },
        },
      };
}

/**
 * Answer the calls `handles` accepts from `scenario`, signed in. Returns every call it answered, in
 * order, as `Service.method`.
 */
export async function answerWithScenario(
  page: Page,
  scenario: ScenarioName,
  handles: (call: string) => boolean,
): Promise<string[]> {
  const session = newMockSession(true);
  const calls: string[] = [];
  await page.route("**/rpc.php", async (route) => {
    const body = route.request().postDataJSON() as {
      service?: string;
      method?: string;
      params?: unknown;
      options?: unknown;
    } | null;
    const call = `${body?.service ?? ""}.${body?.method ?? ""}`;
    if (!handles(call)) {
      await route.fallback();
      return;
    }
    calls.push(call);
    // The mocked VM has no RAID plugin (a 404, which the browser logs as a failed resource): this
    // test answers "no arrays" instead, which is what the disk-use model reads the same way.
    if (call === "MdMgmt.enumerateDevices") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          response: CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.none.value,
          error: null,
        }),
      });
      return;
    }
    const operationId = operationIdOf(body?.service ?? "", body?.method ?? "");
    const answers = scenarioAnswers(scenario, session) as Record<
      string,
      | Resolved
      | ((c: { params: unknown; options: unknown }) => Resolved)
      | undefined
    >;
    const answer = answers[operationId];
    if (answer === undefined) {
      await route.fallback();
      return;
    }
    const resolved =
      typeof answer === "function"
        ? answer({ params: body?.params, options: body?.options })
        : answer;
    const reply = replyOf(operationId, resolved);
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
    });
  });
  return calls;
}

/** The storage calls the file-system pages make, with the pending-changes path. */
export const STORAGE_CALLS = (call: string): boolean =>
  /^(FileSystemMgmt|FsTab|DiskMgmt|MdMgmt|Exec|Config)\./.test(call) ||
  call === "ShareMgmt.getList" ||
  call === "Services.getStatus" ||
  call === "System.getInformation";
