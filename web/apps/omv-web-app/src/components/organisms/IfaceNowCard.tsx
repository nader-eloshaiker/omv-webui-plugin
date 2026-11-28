// SPDX-License-Identifier: GPL-3.0-or-later
// "Now" on an interface's page (phase 5 network design 4.2 item 3, 4.3; 0.3): what the interface uses
// now, from Network.getInformation, as facts in words: its connection and state, the address of each
// family with its router address, its hardware address, packet size and speed; for a VLAN its ID and
// what it runs on; for a bond or bridge its ports or interfaces, each a router link with its
// connection. No status colour (D8). Everything from the NAS is text (UI-2).
import {
  Card,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  IsolatedIdentifier,
} from "@omv-webui/react-ui-components";
import { useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useInterfaceInformation } from "../../hooks/useNetworkReads.ts";
import { vlanParent } from "../../network/connection.ts";
import type { DeviceRow } from "../../network/dto.ts";
import {
  addressInUse,
  connectionWord,
  kindOf,
  stateWord,
} from "../../network/ifaceModel.ts";
import { IfaceLink } from "../atoms/IfaceLink.tsx";
import { IfaceConnection } from "../molecules/IfaceConnection.tsx";
import { IfaceReadFailed } from "../molecules/IfaceReadFailed.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

export function IfaceNowCard({
  device,
  devices,
}: {
  /** The interface's row of enumerateDevicesList (its name matched there). */
  device: DeviceRow;
  devices: readonly DeviceRow[];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const headingId = useId();
  const info = useInterfaceInformation(device.devicename);
  const name = device.devicename;

  let body: ReactNode;
  if (info.data === undefined && info.isError) {
    body = (
      <IfaceReadFailed
        sentence="iface.loadNowFailed"
        iface={name}
        error={info.error}
        onRetry={() => void info.refetch()}
        retrying={info.isFetching}
      />
    );
  } else if (info.data === undefined) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <p role="status" className="sr-only">
          {t("iface.loadingNow")}
        </p>
        <FactListSkeleton rows={6} />
      </div>
    );
  } else {
    const now = info.data;
    const state = stateWord(now.state);
    const v4 = addressInUse(now, 4);
    const v6 = addressInUse(now, 6);
    const speed = now.speed < 0 ? null : format.speed(now.speed);
    const kind = kindOf({ type: device.type, vlanid: device.vlanid });
    const parent = kind === "vlan" ? vlanParent(device) : null;
    const members =
      kind === "bond" || kind === "bridge" ? [...(device.slaves ?? [])] : null;
    const mtu = String(now.mtu).trim();
    const missing = (text: string) => (
      <FactListValue variant="missing">{text}</FactListValue>
    );
    body = (
      <FactList>
        <FactListItem>
          <FactListLabel>{t("iface.fact.connection")}</FactListLabel>
          <FactListValue>
            <IfaceConnection word={connectionWord(now)} />
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("iface.fact.state")}</FactListLabel>
          {state.key === null ? (
            <FactListValue variant="identifier" dir="ltr">
              {inertBidi(state.value)}
            </FactListValue>
          ) : (
            <FactListValue>{t(state.key)}</FactListValue>
          )}
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("iface.fact.ipv4")}</FactListLabel>
          {v4 === null ? (
            missing(t("interfaces.noAddress"))
          ) : (
            <FactListValue variant="identifier" dir="ltr">
              {v4.text}
            </FactListValue>
          )}
        </FactListItem>
        {now.gateway.trim() === "" ? null : (
          <FactListItem>
            <FactListLabel>{t("iface.fact.gateway")}</FactListLabel>
            <FactListValue variant="identifier" dir="ltr">
              {inertBidi(now.gateway.trim())}
            </FactListValue>
          </FactListItem>
        )}
        <FactListItem>
          <FactListLabel>{t("iface.fact.ipv6")}</FactListLabel>
          {v6 === null ? (
            missing(t("interfaces.noAddress"))
          ) : (
            <FactListValue>
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <Value value={v6.text} />
                {v6.linkLocal ? (
                  <span className="text-sm text-muted-foreground">
                    {t("interfaces.linkLocal")}
                  </span>
                ) : null}
              </span>
            </FactListValue>
          )}
        </FactListItem>
        {now.gateway6.trim() === "" ? null : (
          <FactListItem>
            <FactListLabel>{t("iface.fact.gateway6")}</FactListLabel>
            <FactListValue variant="identifier" dir="ltr">
              {inertBidi(now.gateway6.trim())}
            </FactListValue>
          </FactListItem>
        )}
        <FactListItem>
          <FactListLabel>{t("iface.fact.mac")}</FactListLabel>
          {now.ether.trim() === "" ? (
            missing(t("common.notReported"))
          ) : (
            <FactListValue variant="identifier" dir="ltr">
              {inertBidi(now.ether.trim().toLowerCase())}
            </FactListValue>
          )}
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("iface.fact.mtu")}</FactListLabel>
          {mtu === "" ? (
            missing(t("common.notReported"))
          ) : (
            <FactListValue>{t("iface.mtuBytes", { size: mtu })}</FactListValue>
          )}
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("iface.fact.speed")}</FactListLabel>
          {speed === null ? (
            missing(t("iface.fact.speedUnknown"))
          ) : (
            <FactListValue>{speed}</FactListValue>
          )}
        </FactListItem>
        {parent === null ? null : (
          <FactListItem>
            <FactListLabel>{t("iface.fact.vlanLabel")}</FactListLabel>
            <FactListValue>
              <Trans
                i18nKey="iface.fact.vlan"
                components={{
                  id: <Value value={String(now.vlanid)} />,
                  parent: <IfaceLink devicename={parent} />,
                }}
              />
            </FactListValue>
          </FactListItem>
        )}
        {members === null ? null : (
          <FactListItem>
            <FactListLabel>
              {kind === "bridge"
                ? t("iface.fact.bridgeMembers")
                : t("iface.fact.members")}
            </FactListLabel>
            {members.length === 0 ? (
              missing(t("iface.fact.noMembers"))
            ) : (
              <FactListValue>
                <ul className="flex flex-col gap-1">
                  {members.map((member) => {
                    const row = devices.find((d) => d.devicename === member);
                    return (
                      <li
                        key={member}
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
                      >
                        <IfaceLink devicename={member} />
                        {row === undefined ? null : (
                          <span className="text-sm">
                            <IfaceConnection word={connectionWord(row)} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </FactListValue>
            )}
          </FactListItem>
        )}
      </FactList>
    );
  }

  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex flex-col gap-group p-4"
    >
      <h2 id={headingId} className="text-section text-foreground">
        {t("iface.now")}
      </h2>
      {body}
    </Card>
  );
}
