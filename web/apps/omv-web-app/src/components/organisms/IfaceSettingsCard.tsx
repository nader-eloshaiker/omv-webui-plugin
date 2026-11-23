// SPDX-License-Identifier: GPL-3.0-or-later
// "Settings" on an interface's page (phase 5 network design 4.2 item 4; 0.3): the stored row, as
// facts in words. Where a stored value differs from what the interface uses now (1.8's comparison),
// "In use now" follows it with the pending mark: nothing claims a setting is in effect because it was
// saved. The Wi-Fi password is only whether one is set (x-omv-presence; UI-6). "Change settings"
// opens the form in place.
import {
  Button,
  Card,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  IsolatedIdentifier,
} from "@omv-webui/react-ui-components";
import { useId, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { DeviceRow, IfaceSettings } from "../../network/dto.ts";
import {
  addressInUse,
  BOND_MODE_NAMES,
  BOND_MODES,
  differsFromInUse,
  howWord4,
  howWord6,
  splitList,
  type InUseDifference,
  type InUseField,
} from "../../network/ifaceModel.ts";
import { prefixFromMask } from "../../network/ip.ts";
import { PendingMark } from "../atoms/PendingMark.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

type LiveRow = Pick<
  DeviceRow,
  | "address"
  | "prefix"
  | "gateway"
  | "address6"
  | "prefix6"
  | "gateway6"
  | "mtu"
  | "ether"
>;

/** "In use now: …" with the pending mark, under the stored value it differs from. */
function InUse({ value }: { value: ReactNode }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span>
        <Trans i18nKey="iface.inUseNow" components={{ value: <>{value}</> }} />
      </span>
      <PendingMark />
    </span>
  );
}

export function IfaceSettingsCard({
  settings,
  live,
  pending,
  changeRef,
  onChange,
  changeUnavailable,
}: {
  settings: IfaceSettings;
  /** What the interface uses now (its row of enumerateDevicesList); null when it is not there. */
  live: LiveRow | null;
  /** This session saved these settings and they are not applied yet. */
  pending: boolean;
  changeRef: RefObject<HTMLButtonElement | null>;
  onChange: () => void;
  /** Why "Change settings" cannot be used now, or null. */
  changeUnavailable: string | null;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const reasonId = useId();
  const diffs = live === null ? [] : differsFromInUse(settings, live);
  const differs = (...fields: InUseField[]): InUseDifference | undefined =>
    diffs.find((d) => fields.includes(d.field));
  const none = t("iface.inUseNone");
  const inUse4 = live === null ? none : (addressInUse(live, 4)?.text ?? none);
  const inUse6 = live === null ? none : (addressInUse(live, 6)?.text ?? none);

  const fact = (label: string, value: ReactNode, below?: ReactNode) => (
    <FactListItem>
      <FactListLabel>{label}</FactListLabel>
      <FactListValue>
        <span className="flex flex-col">
          <span>{value}</span>
          {below}
        </span>
      </FactListValue>
    </FactListItem>
  );
  const list = (text: string): ReactNode => {
    const items = splitList(text);
    return items.length === 0 ? null : (
      <span className="flex flex-col">
        {items.map((item) => (
          <Value key={item} value={item} />
        ))}
      </span>
    );
  };
  const automatic =
    settings.method === "dhcp" ||
    settings.method6 === "auto" ||
    settings.method6 === "dhcp";
  const prefix4 = prefixFromMask(settings.netmask);
  const a4 = differs("method", "address", "netmask");
  const g4 = differs("gateway");
  const a6 = differs("method6", "address6", "netmask6");
  const g6 = differs("gateway6");
  const mtu = differs("mtu");
  const mac = differs("altmacaddress");

  const howWithAddress = (how: string, address: string | null) => (
    <span className="flex flex-col">
      <span>{how}</span>
      {address === null ? null : <Value value={address} />}
    </span>
  );

  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("iface.settings")}
        </h2>
        {pending || diffs.length > 0 ? <PendingMark /> : null}
      </div>
      <FactList>
        {fact(
          t("iface.set.ipv4"),
          howWithAddress(
            t(howWord4(settings.method)),
            settings.method === "static"
              ? `${settings.address.trim()}/${prefix4 === null ? settings.netmask : String(prefix4)}`
              : null,
          ),
          a4 === undefined ? null : <InUse value={<Value value={inUse4} />} />,
        )}
        {settings.method === "static" &&
        (settings.gateway.trim() !== "" || g4 !== undefined)
          ? fact(
              t("iface.set.gateway"),
              settings.gateway.trim() === "" ? (
                t("iface.dnsNone")
              ) : (
                <Value value={settings.gateway.trim()} />
              ),
              g4 === undefined ? null : (
                <InUse value={<Value value={g4.inUse || none} />} />
              ),
            )
          : null}
        {fact(
          t("iface.set.ipv6"),
          howWithAddress(
            t(howWord6(settings.method6)),
            settings.method6 === "static"
              ? `${settings.address6.trim()}/${String(settings.netmask6)}`
              : null,
          ),
          a6 === undefined ? null : <InUse value={<Value value={inUse6} />} />,
        )}
        {settings.method6 === "static" &&
        (settings.gateway6.trim() !== "" || g6 !== undefined)
          ? fact(
              t("iface.set.gateway6"),
              settings.gateway6.trim() === "" ? (
                t("iface.dnsNone")
              ) : (
                <Value value={settings.gateway6.trim()} />
              ),
              g6 === undefined ? null : (
                <InUse value={<Value value={g6.inUse || none} />} />
              ),
            )
          : null}
        {fact(
          t("iface.set.dns"),
          list(settings.dnsnameservers) ??
            (automatic ? t("iface.dnsFromRouter") : t("iface.dnsNone")),
        )}
        {fact(
          t("iface.set.search"),
          list(settings.dnssearch) ?? t("iface.dnsNone"),
        )}
        {fact(
          t("iface.set.mtu"),
          settings.mtu > 0
            ? t("iface.mtuBytes", { size: String(settings.mtu) })
            : t("iface.mtuStandard"),
          mtu === undefined ? null : (
            <InUse value={t("iface.mtuBytes", { size: mtu.inUse })} />
          ),
        )}
        {fact(
          t("iface.set.wol"),
          settings.wol ? t("iface.set.on") : t("iface.set.off"),
        )}
        {(settings.altmacaddress ?? "").trim() === ""
          ? null
          : fact(
              t("iface.set.mac"),
              <Value value={settings.altmacaddress.trim().toLowerCase()} />,
              mac === undefined ? null : (
                <InUse value={<Value value={mac.inUse || none} />} />
              ),
            )}
        {settings.routemetric === 0
          ? null
          : fact(t("iface.set.metric"), String(settings.routemetric))}
        {settings.routemetric6 === 1
          ? null
          : fact(t("iface.set.metric6"), String(settings.routemetric6))}
        {settings.comment.trim() === ""
          ? null
          : fact(
              t("iface.set.note"),
              <span dir="auto" className="[overflow-wrap:anywhere]">
                {inertBidi(settings.comment)}
              </span>,
            )}
        {settings.type === "wifi" ? <WifiFacts settings={settings} /> : null}
        {settings.type === "bond" ? <BondFacts settings={settings} /> : null}
      </FactList>
      <div className="flex flex-col items-start gap-1">
        <Button
          ref={changeRef}
          variant="neutral"
          disabled={changeUnavailable !== null}
          focusableWhenDisabled
          aria-describedby={changeUnavailable === null ? undefined : reasonId}
          onClick={() => {
            if (changeUnavailable === null) {
              onChange();
            }
          }}
        >
          {t("iface.change")}
        </Button>
        {changeUnavailable === null ? null : (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {changeUnavailable}
          </p>
        )}
      </div>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FactListItem>
      <FactListLabel>{label}</FactListLabel>
      <FactListValue>{children}</FactListValue>
    </FactListItem>
  );
}

/** For Wi-Fi: network name, security, whether a password is stored, frequency, hidden. */
function WifiFacts({ settings }: { settings: IfaceSettings }) {
  const { t } = useTranslation();
  const security =
    settings.keymanagement === "sae"
      ? t("iface.set.wpa3")
      : settings.keymanagement === "psk"
        ? t("iface.set.wpa2")
        : inertBidi(settings.keymanagement);
  const frequency =
    settings.band === "auto" || settings.band === ""
      ? t("iface.set.frequencyAuto")
      : inertBidi(settings.band.replace("GHz", " GHz"));
  return (
    <>
      <Fact label={t("iface.set.wifiName")}>
        <span dir="auto" className="[overflow-wrap:anywhere]">
          {inertBidi(settings.wpassid)}
        </span>
      </Fact>
      <Fact label={t("iface.set.security")}>{security}</Fact>
      <Fact label={t("iface.set.password")}>
        {settings.wpapsk === true
          ? t("iface.passwordSet")
          : t("iface.passwordNotSet")}
      </Fact>
      <Fact label={t("iface.set.frequency")}>{frequency}</Fact>
      <Fact label={t("iface.set.hidden")}>
        {settings.hidden ? t("iface.set.yes") : t("iface.set.no")}
      </Fact>
    </>
  );
}

/** For a bond: what it does (7.1's words), its main port, and the timing settings as text. */
function BondFacts({ settings }: { settings: IfaceSettings }) {
  const { t } = useTranslation();
  const mode =
    settings.bondmode === BOND_MODES.backup
      ? t("iface.set.mode.backup")
      : settings.bondmode === BOND_MODES.lacp
        ? t("iface.set.mode.lacp")
        : settings.bondmode === BOND_MODES.alb
          ? t("iface.set.mode.alb")
          : t("iface.set.mode.classic", {
              mode:
                BOND_MODE_NAMES[settings.bondmode] ?? String(settings.bondmode),
            });
  return (
    <>
      <Fact label={t("iface.set.bondMode")}>{mode}</Fact>
      <Fact label={t("iface.set.primary")}>
        {settings.bondprimary.trim() === "" ? (
          t("iface.set.primaryNone")
        ) : (
          <Value value={settings.bondprimary.trim()} />
        )}
      </Fact>
      <Fact label={t("iface.set.timing")}>
        {t("iface.set.timingText", {
          miimon: settings.bondmiimon,
          updelay: settings.bondupdelay,
          downdelay: settings.bonddowndelay,
        })}
      </Fact>
    </>
  );
}
