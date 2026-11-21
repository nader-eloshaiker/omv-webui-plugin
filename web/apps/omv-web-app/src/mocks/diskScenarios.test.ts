// SPDX-License-Identifier: GPL-3.0-or-later
// The hand-written disk scenarios are mocks only if they keep the contract's shapes: every reply goes
// through the real transport here, which reports any reply its schema refuses. A drifted scenario
// would otherwise show a state the server can never send.
import {
  diskMgmtGetList,
  fileSystemMgmtEnumerateFilesystems,
  fileSystemMgmtGetList,
  mdMgmtEnumerateDevices,
  smartGetAttributes,
  smartGetDeviceSettings,
  smartGetExtendedInformation,
  smartGetInformation,
  smartGetScheduleList,
  smartGetSelfTestLogs,
  smartGetSettings,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it, vi } from "vitest";
import { answer } from "../test/server.ts";
import { DISK_SCENARIOS } from "./diskScenarios.ts";
import { newMockSession, scenarioAnswers } from "./scenarios.ts";

const ALL = { start: 0, limit: null, sortfield: null, sortdir: null };

describe("the disk scenarios", () => {
  it.each(["admin", ...DISK_SCENARIOS] as const)(
    "%s answers every disk read in the contract's shapes",
    async (name) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      answer(scenarioAnswers(name, newMockSession(true)));
      const settle = (p: Promise<unknown>) => p.catch(() => undefined);
      const list = await settle(diskMgmtGetList(ALL));
      await Promise.all([
        settle(fileSystemMgmtGetList(ALL)),
        settle(fileSystemMgmtEnumerateFilesystems()),
        settle(mdMgmtEnumerateDevices()),
        settle(smartGetSettings()),
        settle(smartGetScheduleList(ALL)),
      ]);
      const disks =
        (list as { data?: { devicefile: string }[] } | undefined)?.data ?? [];
      for (const disk of disks) {
        const params = { devicefile: disk.devicefile };
        await Promise.all([
          settle(smartGetDeviceSettings(params)),
          settle(smartGetInformation(params)),
          settle(smartGetAttributes(params)),
          settle(smartGetSelfTestLogs(params)),
          settle(smartGetExtendedInformation(params)),
        ]);
      }
      expect(warn).not.toHaveBeenCalled();
    },
  );
});
