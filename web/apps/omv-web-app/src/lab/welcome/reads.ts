// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's own replies, read the way the dashboard reads them, for the parts of the page the lab
// does not draw from model.ts: the disk temperatures (DiskMgmt.getList, Smart.getInformation for the
// disks awake, Smart.getSettings `tempmax`, Zfs.getPoolStatus and Zfs.getPoolDevices, the configured
// file systems' labels) through the app's own `temperatureGroups`, and This NAS from
// System.getInformation. Development only (UI-11): the lab boots no mock, so the replies are taken
// from the scenario builders directly, with no network.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DiskDevice,
  SystemInformation,
  ZfsPoolDevice,
  ZfsPoolStatus,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import {
  driveKindOf,
  type DiskGroup,
  type DrivePictureKind,
} from "@omv-webui/react-ui-components";
import { temperatureGroups } from "../../dashboard/nasModel.ts";
import { dashboardAnswers } from "../../mocks/dashboardScenarios.ts";

type Reply = FixedAnswer | ((call: { params: unknown }) => FixedAnswer);

function valueOf<T>(
  reply: Reply | undefined,
  params: unknown = null,
): T | undefined {
  if (reply === undefined) {
    return undefined;
  }
  const answer = typeof reply === "function" ? reply({ params }) : reply;
  return answer.status === 200 ? (answer.value as T) : undefined;
}

const rows = <T>(reply: Reply | undefined): T[] =>
  valueOf<{ data: T[] }>(reply)?.data ?? [];

export interface LabReads {
  temperatures: DiskGroup[];
  info: SystemInformation;
}

/** The temperatures and the system's facts of a new NAS or of the mock's NAS, all fine. */
export function labReads(newNas: boolean): LabReads {
  const answers = dashboardAnswers(
    newNas ? "dashboardNewNas" : "dashboardAllOk",
  );
  const disks = rows<DiskDevice>(answers.diskMgmtGetList);
  const kinds = new Map<string, DrivePictureKind | null>(
    disks.map((d) => [
      d.devicename,
      d.powermode === "STANDBY"
        ? null
        : driveKindOf(
            d,
            valueOf<{ rotationrate?: unknown }>(answers.smartGetInformation, {
              devicefile: d.devicefile,
            }),
          ),
    ]),
  );
  const settings = valueOf<{ tempmax: number }>(answers.smartGetSettings);
  const pools = valueOf<ZfsPoolStatus[]>(answers.zfsGetPoolStatus) ?? null;
  const poolDevices = new Map<string, readonly ZfsPoolDevice[] | "failed">(
    (pools ?? []).map((p) => [
      p.name,
      valueOf<ZfsPoolDevice[]>(answers.zfsGetPoolDevices, { name: p.name }) ??
        "failed",
    ]),
  );
  const configured = rows<ConfiguredFilesystem>(answers.fileSystemMgmtGetList);
  const temperatures = temperatureGroups(
    disks,
    kinds,
    settings?.tempmax ?? 0,
    pools,
    poolDevices,
    configured.map((f) => ({ devicename: f.devicename, label: f.label })),
  );
  // The mock's System.getInformation for these scenarios: first steps hidden on the NAS that is set
  // up (adminWelcomeDismissed), shown on the new one (admin).
  const info = (newNas
    ? CONTRACT_EXAMPLES.systemGetInformation.admin.value
    : CONTRACT_EXAMPLES.systemGetInformation.adminWelcomeDismissed
        .value) as unknown as SystemInformation;
  return { temperatures, info };
}
