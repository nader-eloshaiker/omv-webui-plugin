// SPDX-License-Identifier: GPL-3.0-or-later
// The address part every kind of interface shares (phase 5 network design 5.2 items 2 to 4): the
// library's AddressFields with this slice's words (`ifaceForm.*`, the terms of 0.1 under each
// choice), the network-size readout as it is typed, the name-server hint that fits the methods
// chosen, and the form's refusals (5.3) under their fields. The form holds the draft and the checks.
import {
  AddressFields,
  IsolatedIdentifier,
  type AddressFieldKey,
  type AddressFieldsErrors,
  type AddressFieldsLabels,
  type AddressFieldsValue,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { sizeReadout, type AddressDraft } from "../../network/ifaceModel.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";

/** The draft's field behind each part of the library's fields. */
const ADDRESS_FIELD_OF = {
  "ipv4.method": "method",
  "ipv4.address": "address",
  "ipv4.size": "size",
  "ipv4.router": "gateway",
  "ipv6.method": "method6",
  "ipv6.address": "address6",
  "ipv6.prefix": "prefix6",
  "ipv6.router": "gateway6",
  "dns.servers": "dnsnameservers",
  "dns.search": "dnssearch",
} as const satisfies Record<AddressFieldKey, keyof AddressDraft>;

type AddressPartField = (typeof ADDRESS_FIELD_OF)[AddressFieldKey];

const valueOf = (draft: AddressDraft): AddressFieldsValue => ({
  ipv4: {
    method: draft.method,
    address: draft.address,
    size: draft.size,
    router: draft.gateway,
  },
  ipv6: {
    method: draft.method6,
    address: draft.address6,
    prefix: draft.prefix6,
    router: draft.gateway6,
  },
  dns: { servers: draft.dnsnameservers, search: draft.dnssearch },
});

const draftOf = (
  draft: AddressDraft,
  value: AddressFieldsValue,
): AddressDraft => ({
  ...draft,
  method: value.ipv4.method,
  address: value.ipv4.address,
  size: value.ipv4.size,
  gateway: value.ipv4.router,
  method6: value.ipv6.method,
  address6: value.ipv6.address,
  prefix6: value.ipv6.prefix,
  gateway6: value.ipv6.router,
  dnsnameservers: value.dns.servers,
  dnssearch: value.dns.search,
});

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={value} />
);

export function IfaceAddressPart({
  draft,
  onChange,
  onBlur,
  errors,
  familyNotes,
  domain,
  disabled,
  disabledReason,
}: {
  draft: AddressDraft;
  onChange: (draft: AddressDraft) => void;
  onBlur: (field: AddressPartField) => void;
  /** The refusals to show, by the draft's field. */
  errors: Partial<Record<AddressPartField, ReactNode>>;
  /** 5.5's refusal or "With both off…", under a family's choice. */
  familyNotes: { ipv4?: ReactNode; ipv6?: ReactNode };
  /** The NAS's domain, for the search domains' placeholder. */
  domain: string;
  disabled: boolean;
  disabledReason?: ReactNode;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const automatic =
    draft.method === "dhcp" ||
    draft.method6 === "auto" ||
    draft.method6 === "dhcp";
  const labels: AddressFieldsLabels = {
    optional: t("ifaceForm.optional"),
    ipv4: {
      legend: t("ifaceForm.ipv4.label"),
      how: t("ifaceForm.ipv4How"),
      methods: {
        dhcp: {
          label: t("ifaceForm.ipv4.dhcp"),
          hint: t("network.term.dhcp"),
        },
        static: {
          label: t("ifaceForm.ipv4.static"),
          hint: t("network.term.static"),
        },
        manual: { label: t("ifaceForm.off"), hint: t("network.term.manual") },
      },
      address: t("ifaceForm.address"),
      addressPlaceholder: "192.0.2.10",
      size: t("ifaceForm.size"),
      sizePlaceholder: "24",
      router: t("ifaceForm.gateway"),
      routerPlaceholder: "192.0.2.1",
      routerHint: t("network.term.gateway"),
      fixedHint: t("ifaceForm.fixedHint"),
    },
    ipv6: {
      legend: t("ifaceForm.ipv6.label"),
      how: t("ifaceForm.ipv6How"),
      methods: {
        auto: {
          label: t("ifaceForm.ipv6.auto"),
          hint: t("network.term.auto"),
        },
        dhcp: {
          label: t("ifaceForm.ipv6.dhcp"),
          hint: t("network.term.dhcp6"),
        },
        static: {
          label: t("ifaceForm.ipv6.static"),
          hint: t("network.term.static"),
        },
        manual: { label: t("ifaceForm.off"), hint: t("network.term.manual") },
      },
      address: t("ifaceForm.address"),
      addressPlaceholder: "2001:db8::10",
      prefix: t("ifaceForm.prefix"),
      prefixHint: t("ifaceForm.prefixHint"),
      router: t("ifaceForm.gateway"),
      routerPlaceholder: "2001:db8::1",
      routerHint: t("network.term.gateway"),
    },
    dns: {
      legend: t("ifaceForm.dns"),
      servers: t("ifaceForm.dnsServers"),
      serversPlaceholder: "192.0.2.1",
      serversHint: automatic
        ? t("ifaceForm.dnsAutoHint")
        : t("ifaceForm.dnsStaticHint"),
      serversNote: t("ifaceForm.dnsNotFinding"),
      search: t("ifaceForm.search"),
      searchPlaceholder: domain.trim() === "" ? "example.org" : domain.trim(),
      searchHint: t("network.term.dnssearch"),
    },
  };
  const fieldErrors: AddressFieldsErrors = {};
  for (const [key, field] of Object.entries(ADDRESS_FIELD_OF) as [
    AddressFieldKey,
    AddressPartField,
  ][]) {
    if (errors[field] !== undefined) {
      fieldErrors[key] = errors[field];
    }
  }
  const readout =
    draft.method === "static" ? sizeReadout(draft.address, draft.size) : null;
  return (
    <AddressFields
      value={valueOf(draft)}
      onValueChange={(value) => onChange(draftOf(draft, value))}
      onBlur={(key) => onBlur(ADDRESS_FIELD_OF[key])}
      labels={labels}
      errors={fieldErrors}
      sizeReadout={
        readout === null ? undefined : (
          <Trans
            i18nKey="ifaceForm.sizeShows"
            components={{
              network: <Value value={readout.network} />,
              first: <Value value={readout.first} />,
              last: <Value value={readout.last} />,
              count: <NodeSlot value={format.count(readout.count)} />,
            }}
          />
        )
      }
      familyNotes={familyNotes}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
