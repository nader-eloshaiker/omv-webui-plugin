// SPDX-License-Identifier: GPL-3.0-or-later
// "What to do now" on an array's page (phase 5 RAID design 2.4; Flow F, 8): only when the array is
// short of a disk, not running, rebuilding, or a working member's health check (the session's own, never
// started here) says Warning or Critical. Each case says only what applies, with the disks named by
// device, model and serial number. It never claims a disk is failing from anything but its role or the
// session's health check.
import type { DiskDevice, MdDisk } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Identifier,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import { formatBytes } from "../../format/format.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { diskOf, smallestMember } from "../../raid/raidChoices.ts";
import { arrayAddress, type Member } from "../../raid/raidModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { Slotted } from "../atoms/Slotted.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";

export function ArrayNowCard({
  view,
  disks,
  slaves,
  addBlocked,
  onTakeOut,
  onRescan,
}: {
  view: ArrayView;
  disks: readonly DiskDevice[] | undefined;
  slaves: readonly MdDisk[] | undefined;
  /** Adding a disk is refused now (the add section says why): no "Add" button here. */
  addBlocked: boolean;
  onTakeOut: (member: Member) => void;
  onRescan: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const check = useDiskCheck();
  const [rescanning, setRescanning] = useState(false);
  const { row, state, report } = view;
  const address = arrayAddress(row);
  const min = smallestMember(slaves);
  const size = min === null ? "" : formatBytes(min);
  const known = report !== null && report.known ? report : null;
  const named = (device: string) => {
    const disk = diskOf(device, disks);
    const slave = slaves?.find((s) => s.devicefile === device);
    return {
      model: disk?.model.trim() ?? "",
      serial: disk?.serialnumber.trim() ?? slave?.serialnumber.trim() ?? "",
      disk,
    };
  };
  const addLink =
    address === null || addBlocked ? null : (
      <Link
        to="/storage/md/$array/add"
        params={{ array: address }}
        className={buttonClass({ variant: "primary" })}
      >
        {t("array.now.addNew")}
      </Link>
    );

  let title: string;
  let body: ReactNode;
  if (state.kind === "inactive" || state.kind === "failed") {
    title = t("array.now.stoppedTitle");
    body = <p>{t("array.now.stoppedBody")}</p>;
  } else if (state.kind === "rebuilding") {
    title = t("array.now.rebuildingTitle");
    body = (
      <p>
        <Slotted
          sentence={(tokens) => t("array.now.rebuildingBody", tokens)}
          values={{
            disk: <Identifier>{state.rebuildingOnto ?? ""}</Identifier>,
          }}
        />
      </p>
    );
  } else if (state.kind === "degraded" && known !== null && known.failed > 0) {
    const failed = known.members.find((m) => m.role === "failed");
    const who = failed === undefined ? null : named(failed.device);
    title = t("array.now.failedTitle");
    body = (
      <>
        {failed === undefined || who === null ? null : (
          <p>
            <Slotted
              sentence={(tokens) =>
                t("array.now.failedBody", { ...tokens, size })
              }
              values={{
                device: <Identifier>{failed.device}</Identifier>,
                model: who.model,
                serial: <Identifier>{who.serial}</Identifier>,
              }}
            />
          </p>
        )}
        <ol className="flex list-decimal flex-col gap-1 ps-5">
          <li>{t("array.now.wayFree")}</li>
          <li>{t("array.now.wayNoFree")}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          {addLink}
          {failed === undefined ? null : (
            <Button variant="neutral" onClick={() => onTakeOut(failed)}>
              {t("array.now.takeOut")}
            </Button>
          )}
        </div>
      </>
    );
  } else if (state.kind === "degraded") {
    const still = known?.members.filter((m) => m.role !== "failed") ?? [];
    title = t("array.now.missingTitle");
    body = (
      <>
        <p>
          <Slotted
            sentence={(tokens) => t("array.now.missingBody", tokens)}
            values={{
              list: (
                <>
                  {still.map((m, i) => (
                    <span key={m.device}>
                      {i > 0 ? ", " : ""}
                      <Slotted
                        sentence={(tokens) =>
                          t("array.now.memberSerial", tokens)
                        }
                        values={{
                          device: <Identifier>{m.device}</Identifier>,
                          serial: (
                            <Identifier>{named(m.device).serial}</Identifier>
                          ),
                        }}
                      />
                    </span>
                  ))}
                </>
              ),
            }}
          />
        </p>
        <p>{t("array.now.missingConnect", { size })}</p>
        <div className="flex flex-wrap gap-2">
          {addLink}
          <Button
            variant="neutral"
            loading={rescanning}
            onClick={
              rescanning
                ? undefined
                : () => {
                    setRescanning(true);
                    void onRescan().finally(() => setRescanning(false));
                  }
            }
          >
            {rescanning ? t("array.now.rescanning") : t("array.now.rescan")}
          </Button>
        </div>
      </>
    );
  } else {
    // A working member the session's health check warns about, on an OK array (2.4, last row).
    const failing = known?.members.find((m) => {
      if (m.role !== "working") {
        return false;
      }
      const reading = check.reading(
        named(m.device).disk?.canonicaldevicefile ?? m.device,
      );
      const status =
        reading === undefined ? "ok" : diskState(reading.overallstatus).status;
      return status === "warning" || status === "critical";
    });
    if (state.kind !== "ok" || failing === undefined || address === null) {
      return null;
    }
    const who = named(failing.device);
    const reading = check.reading(
      who.disk?.canonicaldevicefile ?? failing.device,
    );
    title = t("array.now.failingTitle");
    body = (
      <>
        <p>
          <Slotted
            sentence={(tokens) => t("array.now.failingBody", tokens)}
            values={{
              device: <Identifier>{failing.device}</Identifier>,
              model: who.model,
              serial: <Identifier>{who.serial}</Identifier>,
              reason:
                reading === undefined ? null : (
                  <DiskReason overallstatus={reading.overallstatus} />
                ),
            }}
          />
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {addBlocked ? null : (
            <Link
              to="/storage/md/$array/add"
              params={{ array: address }}
              className={buttonClass({ variant: "neutral" })}
            >
              {t("array.now.addSpare")}
            </Link>
          )}
          {who.disk === undefined ? null : (
            <Link
              to="/storage/disks/$disk"
              params={{ disk: who.disk.devicename }}
              className={routerLinkClass}
            >
              {t("array.now.openDisk", {
                device: who.disk.canonicaldevicefile,
              })}
            </Link>
          )}
        </div>
      </>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex max-w-prose flex-col gap-3">
        {body}
      </CardContent>
    </Card>
  );
}
