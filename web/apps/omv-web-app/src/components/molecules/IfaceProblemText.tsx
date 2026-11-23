// SPDX-License-Identifier: GPL-3.0-or-later
// One refusal of the interface form (phase 5 network design 5.3, 6.3, 7.3, 8.2) in words, under its
// field. The values in it (an address typed, an interface's name, a network) are text in the
// identifier style, isolated and left to right; a name from the NAS shows its bidirectional controls
// (UI-2).
import { IsolatedIdentifier } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { FormProblem } from "../../network/ifaceForm.ts";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

export function IfaceProblemText({ problem }: { problem: FormProblem }) {
  const { t } = useTranslation();
  switch (problem.code) {
    case "ifaceForm.err.networkAddress":
      return (
        <Trans
          i18nKey={problem.code}
          components={{
            value: <Value value={problem.value} />,
            first: <Value value={problem.first} />,
            last: <Value value={problem.last} />,
          }}
        />
      );
    case "ifaceForm.err.reserved":
    case "ifaceForm.err.dnsServer":
    case "ifaceForm.err.search":
      return (
        <Trans
          i18nKey={problem.code}
          components={{ value: <Value value={problem.value} /> }}
        />
      );
    case "ifaceForm.err.gatewayNetwork":
      return (
        <Trans
          i18nKey={problem.code}
          components={{
            value: <Value value={problem.value} />,
            network: <Value value={problem.network} />,
          }}
        />
      );
    case "ifaceForm.err.duplicate":
      return (
        <Trans
          i18nKey={problem.code}
          components={{
            iface: <Value value={problem.iface} />,
            value: <Value value={problem.value} />,
          }}
        />
      );
    case "vlan.err.sameNetwork":
      return (
        <Trans
          i18nKey={problem.code}
          components={{
            parent: <Value value={problem.parent} />,
            network: <Value value={problem.network} />,
          }}
        />
      );
    case "vlan.err.taken":
      return (
        <Trans
          i18nKey={problem.code}
          components={{
            parent: <Value value={problem.parent} />,
            id: <Value value={String(problem.id)} />,
          }}
        />
      );
    case "ifaceForm.err.ipv4":
    case "ifaceForm.err.size":
    case "ifaceForm.err.gatewaySelf":
    case "ifaceForm.err.ipv6":
    case "ifaceForm.err.prefix":
    case "ifaceForm.err.dnsNone":
    case "ifaceForm.err.mtu":
    case "ifaceForm.err.mac":
    case "ifaceForm.err.metric":
    case "ifaceForm.err.port":
    case "wifi.err.hardware":
    case "wifi.err.name":
    case "wifi.err.password":
    case "bond.err.noPort":
    case "bond.err.primary":
    case "vlan.err.id":
    case "vlan.err.runsOn":
      return t(problem.code);
  }
}
