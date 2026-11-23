// SPDX-License-Identifier: GPL-3.0-or-later
// One line of "What it does to other computers" for an interface change (phase 5 network design 5.6,
// 7.2, 9.1): an address that changes, an address the router may still hand out, a new hardware
// address, Wake-on-LAN turned off, and the hardware address of a new bond or bridge. Under the form's
// class line and in the change flow's summary.
import { IsolatedIdentifier } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { OtherEffect } from "../../network/impact.ts";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

export function IfaceOtherEffect({ effect }: { effect: OtherEffect }) {
  const { t } = useTranslation();
  switch (effect.code) {
    case "ifaceForm.other.address":
      return (
        <Trans
          i18nKey={effect.code}
          components={{
            old: <Value value={effect.old} />,
            new: <Value value={effect.new} />,
          }}
        />
      );
    case "ifaceForm.other.dhcpPool":
      return (
        <Trans
          i18nKey={effect.code}
          components={{ address: <Value value={effect.address} /> }}
        />
      );
    case "ifaceForm.other.wol":
      return (
        <Trans
          i18nKey={effect.code}
          components={{ iface: <Value value={effect.iface} /> }}
        />
      );
    case "ifaceForm.other.mac":
    case "bond.newMac":
    case "bridge.newMac":
      return t(effect.code);
  }
}
