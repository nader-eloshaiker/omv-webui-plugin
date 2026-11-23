// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldRequired,
} from "../field/field";
import { InlineAlert } from "../inline-alert/inline-alert";
import {
  RadioGroupField,
  RadioOption,
} from "../radio-group-field/radio-group-field";
import { TextareaField } from "../textarea-field/textarea-field";

/** How the NAS gets its IPv4 address: from the router, a fixed one, or none (design 0.1). */
type Ipv4Method = "dhcp" | "static" | "manual";
/** How it gets its IPv6 address: router announcements, a DHCPv6 server, a fixed one, or none. */
type Ipv6Method = "auto" | "dhcp" | "static" | "manual";

const IPV4_METHODS: readonly Ipv4Method[] = ["dhcp", "static", "manual"];
const IPV6_METHODS: readonly Ipv6Method[] = [
  "auto",
  "dhcp",
  "static",
  "manual",
];

/**
 * The fields' value, held by the caller, every text exactly as typed. The network size is the text
 * typed ("24", "/24" or "255.255.255.0"); the caller parses it, stores OMV's form and gives back the
 * readout. Text under a method that is not chosen is kept, so switching back restores it.
 */
interface AddressFieldsValue {
  ipv4: { method: Ipv4Method; address: string; size: string; router: string };
  ipv6: { method: Ipv6Method; address: string; prefix: string; router: string };
  dns: { servers: string; search: string };
}

/** Names one part of the fields, for its error, its blur and its `data-field` attribute. */
type AddressFieldKey =
  | "ipv4.method"
  | "ipv4.address"
  | "ipv4.size"
  | "ipv4.router"
  | "ipv6.method"
  | "ipv6.address"
  | "ipv6.prefix"
  | "ipv6.router"
  | "dns.servers"
  | "dns.search";

/** The caller's refusals (design 5.3), each shown under its field and given as its description. */
type AddressFieldsErrors = Partial<Record<AddressFieldKey, React.ReactNode>>;

/** A method's words: the choice and its term's sentence (design 0.1) under it. */
interface AddressMethodWords {
  label: React.ReactNode;
  hint?: React.ReactNode;
}

/** Every word the fields show (design 5.9, `ifaceForm.*`). All come from the caller's catalogue. */
interface AddressFieldsLabels {
  /** Marks the router addresses and search domains as optional, in words: "Optional". */
  optional: string;
  ipv4: {
    /** The fieldset's legend: "IPv4". */
    legend: React.ReactNode;
    /** "How the NAS gets its IPv4 address". */
    how: React.ReactNode;
    methods: Readonly<Record<Ipv4Method, AddressMethodWords>>;
    /** "Address", with an example placeholder such as "192.0.2.10". */
    address: React.ReactNode;
    addressPlaceholder?: string;
    /** "Network size", placeholder "24". */
    size: React.ReactNode;
    sizePlaceholder?: string;
    /** "Router address", placeholder "192.0.2.1", hint `network.term.gateway`. */
    router: React.ReactNode;
    routerPlaceholder?: string;
    routerHint?: React.ReactNode;
    /** Under the fixed fields: "Choose an address no other device uses. …" */
    fixedHint?: React.ReactNode;
  };
  ipv6: {
    legend: React.ReactNode;
    how: React.ReactNode;
    methods: Readonly<Record<Ipv6Method, AddressMethodWords>>;
    address: React.ReactNode;
    addressPlaceholder?: string;
    /** "Prefix length", hint "Almost always 64." */
    prefix: React.ReactNode;
    prefixHint?: React.ReactNode;
    router: React.ReactNode;
    routerPlaceholder?: string;
    routerHint?: React.ReactNode;
  };
  dns: {
    /** "Name servers (DNS)". */
    legend: React.ReactNode;
    /** "Name servers", placeholder "192.0.2.1". */
    servers: React.ReactNode;
    serversPlaceholder?: string;
    /** The hint that fits the methods chosen (`ifaceForm.dnsAutoHint` or `dnsStaticHint`). */
    serversHint?: React.ReactNode;
    /** Always under it: "They do not change how other computers find this NAS." */
    serversNote?: React.ReactNode;
    /** "Search domains", placeholder the domain or "example.org", hint `network.term.dnssearch`. */
    search: React.ReactNode;
    searchPlaceholder?: string;
    searchHint?: React.ReactNode;
  };
}

interface AddressFieldsProps {
  value: AddressFieldsValue;
  /** Called with the whole new value: a method chosen, or a character typed. */
  onValueChange: (value: AddressFieldsValue) => void;
  /** A field was left: the moment to check it (style guide 5.3, design 5.3: on blur and on Save). */
  onBlur?: (field: AddressFieldKey) => void;
  labels: AddressFieldsLabels;
  errors?: AddressFieldsErrors;
  /**
   * The network the typed size makes, under Network size, worked out by the caller as it is typed:
   * "Network 192.0.2.0/24: 192.0.2.1 to 192.0.2.254, 254 addresses for devices". Part of the size
   * field's description.
   */
  sizeReadout?: React.ReactNode;
  /**
   * A line under a family's method choice, in the warning-shape neutral alert and announced politely:
   * the refusal of design 5.5 ("This page reaches the NAS over IPv4 through enp2s0. Turning IPv4 off
   * would cut it off. …") or "With both off, the NAS cannot be reached through enp3s0." The caller
   * keeps Save unavailable while a refusal shows.
   */
  familyNotes?: { ipv4?: React.ReactNode; ipv6?: React.ReactNode };
  /**
   * Unavailable: every control stays focusable and says so (`aria-disabled`), with `disabledReason`
   * shown once above the fieldsets and given as every control's description. Nothing can be changed.
   */
  disabled?: boolean;
  disabledReason?: React.ReactNode;
  className?: string;
}

interface AddressInputProps {
  fieldKey: AddressFieldKey;
  label: React.ReactNode;
  optional?: string;
  placeholder?: string;
  hint?: React.ReactNode;
  /** A line under the hint, before the error: the network-size readout. */
  readout?: React.ReactNode;
  error?: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: (field: AddressFieldKey) => void;
  unavailable: boolean;
  describedBy?: string;
  numeric?: boolean;
  className?: string;
}

/** One address-like text field: mono, left to right, no autocorrect, on Base UI's Field. */
function AddressInput({
  fieldKey,
  label,
  optional,
  placeholder,
  hint,
  readout,
  error,
  value,
  onValueChange,
  onBlur,
  unavailable,
  describedBy,
  numeric = false,
  className,
}: AddressInputProps) {
  return (
    <Field
      data-slot="address-input"
      invalid={error ? true : undefined}
      className={cn("max-w-sm", className)}
    >
      <FieldLabel className={cn(unavailable && "text-muted-foreground")}>
        {label}
        {optional ? <FieldRequired>{optional}</FieldRequired> : null}
      </FieldLabel>
      <FieldControl
        data-field={fieldKey}
        value={value}
        onValueChange={(next) => onValueChange(next)}
        onBlur={() => onBlur?.(fieldKey)}
        placeholder={placeholder}
        // Addresses are written left to right in every language.
        dir="ltr"
        inputMode={numeric ? "numeric" : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        readOnly={unavailable}
        {...(unavailable ? { "aria-disabled": true } : null)}
        aria-describedby={describedBy}
        className={cn(
          numeric ? "w-[8ch] min-w-20 tabular-nums" : "font-mono",
          unavailable && "cursor-not-allowed bg-muted text-subtle-foreground",
        )}
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {readout ? (
        <FieldHint
          data-slot="address-readout"
          className="text-foreground tabular-nums [overflow-wrap:anywhere]"
        >
          {readout}
        </FieldHint>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

/** The live region under a method choice, always in the page so a note that appears is announced. */
function FamilyNote({ id, note }: { id: string; note?: React.ReactNode }) {
  return (
    <div
      aria-live="polite"
      data-slot="address-family-note-region"
      className="empty:hidden"
    >
      {note ? (
        <InlineAlert
          id={id}
          data-slot="address-family-note"
          tone="neutral"
          icon="warning"
          role="note"
        >
          {note}
        </InlineAlert>
      ) : null}
    </div>
  );
}

const fieldsetClass = "flex min-w-0 flex-col gap-4";
const legendClass = "mb-3 text-lg leading-tight font-semibold text-foreground";

/**
 * How an interface gets its addresses (phase 5 network design 5.2): the IPv4, IPv6 and name-server
 * fieldsets that every kind of interface shares. Each family is a method choice with its term's
 * sentence under each option; a fixed address adds its fields under the choice. The network size
 * takes `24`, `/24` or a dotted mask, with the caller's readout of the network under it.
 *
 * Controlled and wordless, with no rule of its own about addresses: every label is a prop and every
 * check is the caller's, shown under its field and linked as its description. One column at every
 * width, so it holds at 320px and 200% zoom. Each text control carries `data-field` with its
 * `AddressFieldKey`, so the caller can move focus to the first refused field after Save.
 */
function AddressFields({
  value,
  onValueChange,
  onBlur,
  labels,
  errors = {},
  sizeReadout,
  familyNotes = {},
  disabled = false,
  disabledReason,
  className,
}: AddressFieldsProps) {
  const id = React.useId();
  const reasonId = `${id}-reason`;
  const note4Id = `${id}-note4`;
  const note6Id = `${id}-note6`;
  const showReason = disabled && disabledReason !== undefined;
  const reason = showReason ? reasonId : undefined;
  const describe = (...ids: (string | undefined | false)[]) =>
    ids.filter(Boolean).join(" ") || undefined;

  const set4 = (part: Partial<AddressFieldsValue["ipv4"]>) =>
    onValueChange({ ...value, ipv4: { ...value.ipv4, ...part } });
  const set6 = (part: Partial<AddressFieldsValue["ipv6"]>) =>
    onValueChange({ ...value, ipv6: { ...value.ipv6, ...part } });
  const setDns = (part: Partial<AddressFieldsValue["dns"]>) =>
    onValueChange({ ...value, dns: { ...value.dns, ...part } });

  const common = { onBlur, unavailable: disabled, describedBy: reason };

  return (
    <div
      data-slot="address-fields"
      className={cn("flex min-w-0 flex-col gap-8", className)}
    >
      {showReason ? (
        <p
          id={reasonId}
          data-slot="address-fields-reason"
          className="text-sm text-muted-foreground"
        >
          {disabledReason}
        </p>
      ) : null}

      <fieldset data-slot="address-fields-ipv4" className={fieldsetClass}>
        <legend className={legendClass}>{labels.ipv4.legend}</legend>
        <div className="flex flex-col gap-2">
          <RadioGroupField
            legend={labels.ipv4.how}
            value={value.ipv4.method}
            onValueChange={(next) => {
              if (IPV4_METHODS.includes(next as Ipv4Method)) {
                set4({ method: next as Ipv4Method });
              }
            }}
            error={errors["ipv4.method"]}
            disabled={disabled}
            focusableWhenDisabled
            aria-describedby={describe(
              reason,
              familyNotes.ipv4 !== undefined && note4Id,
            )}
          >
            {IPV4_METHODS.map((method) => (
              <RadioOption
                key={method}
                value={method}
                label={labels.ipv4.methods[method].label}
                hint={labels.ipv4.methods[method].hint}
              />
            ))}
          </RadioGroupField>
          <FamilyNote id={note4Id} note={familyNotes.ipv4} />
        </div>
        {value.ipv4.method === "static" ? (
          <div
            data-slot="address-fields-fixed"
            className="flex flex-col gap-4 ps-6"
          >
            <AddressInput
              {...common}
              fieldKey="ipv4.address"
              label={labels.ipv4.address}
              placeholder={labels.ipv4.addressPlaceholder}
              error={errors["ipv4.address"]}
              value={value.ipv4.address}
              onValueChange={(address) => set4({ address })}
            />
            <AddressInput
              {...common}
              fieldKey="ipv4.size"
              label={labels.ipv4.size}
              placeholder={labels.ipv4.sizePlaceholder}
              readout={sizeReadout}
              error={errors["ipv4.size"]}
              value={value.ipv4.size}
              onValueChange={(size) => set4({ size })}
            />
            <AddressInput
              {...common}
              fieldKey="ipv4.router"
              label={labels.ipv4.router}
              optional={labels.optional}
              placeholder={labels.ipv4.routerPlaceholder}
              hint={labels.ipv4.routerHint}
              error={errors["ipv4.router"]}
              value={value.ipv4.router}
              onValueChange={(router) => set4({ router })}
            />
            {labels.ipv4.fixedHint ? (
              <p className="max-w-prose text-sm text-muted-foreground">
                {labels.ipv4.fixedHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset data-slot="address-fields-ipv6" className={fieldsetClass}>
        <legend className={legendClass}>{labels.ipv6.legend}</legend>
        <div className="flex flex-col gap-2">
          <RadioGroupField
            legend={labels.ipv6.how}
            value={value.ipv6.method}
            onValueChange={(next) => {
              if (IPV6_METHODS.includes(next as Ipv6Method)) {
                set6({ method: next as Ipv6Method });
              }
            }}
            error={errors["ipv6.method"]}
            disabled={disabled}
            focusableWhenDisabled
            aria-describedby={describe(
              reason,
              familyNotes.ipv6 !== undefined && note6Id,
            )}
          >
            {IPV6_METHODS.map((method) => (
              <RadioOption
                key={method}
                value={method}
                label={labels.ipv6.methods[method].label}
                hint={labels.ipv6.methods[method].hint}
              />
            ))}
          </RadioGroupField>
          <FamilyNote id={note6Id} note={familyNotes.ipv6} />
        </div>
        {value.ipv6.method === "static" ? (
          <div
            data-slot="address-fields-fixed6"
            className="flex flex-col gap-4 ps-6"
          >
            <AddressInput
              {...common}
              fieldKey="ipv6.address"
              label={labels.ipv6.address}
              placeholder={labels.ipv6.addressPlaceholder}
              error={errors["ipv6.address"]}
              value={value.ipv6.address}
              onValueChange={(address) => set6({ address })}
            />
            <AddressInput
              {...common}
              fieldKey="ipv6.prefix"
              label={labels.ipv6.prefix}
              hint={labels.ipv6.prefixHint}
              error={errors["ipv6.prefix"]}
              value={value.ipv6.prefix}
              onValueChange={(prefix) => set6({ prefix })}
              numeric
            />
            <AddressInput
              {...common}
              fieldKey="ipv6.router"
              label={labels.ipv6.router}
              optional={labels.optional}
              placeholder={labels.ipv6.routerPlaceholder}
              hint={labels.ipv6.routerHint}
              error={errors["ipv6.router"]}
              value={value.ipv6.router}
              onValueChange={(router) => set6({ router })}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset data-slot="address-fields-dns" className={fieldsetClass}>
        <legend className={legendClass}>{labels.dns.legend}</legend>
        <div className="flex max-w-md flex-col gap-1">
          <TextareaField
            data-field="dns.servers"
            label={labels.dns.servers}
            hint={labels.dns.serversHint}
            error={errors["dns.servers"]}
            placeholder={labels.dns.serversPlaceholder}
            value={value.dns.servers}
            onChange={(event) => setDns({ servers: event.target.value })}
            onBlur={() => onBlur?.("dns.servers")}
            mono
            dir="ltr"
            rows={2}
            readOnly={disabled}
            {...(disabled ? { "aria-disabled": true } : null)}
            aria-describedby={reason}
          />
          {labels.dns.serversNote ? (
            <p className="text-sm text-muted-foreground">
              {labels.dns.serversNote}
            </p>
          ) : null}
        </div>
        <TextareaField
          data-field="dns.search"
          label={
            <>
              {labels.dns.search}
              <FieldRequired>{labels.optional}</FieldRequired>
            </>
          }
          hint={labels.dns.searchHint}
          error={errors["dns.search"]}
          placeholder={labels.dns.searchPlaceholder}
          value={value.dns.search}
          onChange={(event) => setDns({ search: event.target.value })}
          onBlur={() => onBlur?.("dns.search")}
          mono
          dir="ltr"
          rows={2}
          readOnly={disabled}
          {...(disabled ? { "aria-disabled": true } : null)}
          aria-describedby={reason}
          className="max-w-md"
        />
      </fieldset>
    </div>
  );
}

export { AddressFields };
export type {
  AddressFieldKey,
  AddressFieldsErrors,
  AddressFieldsLabels,
  AddressFieldsProps,
  AddressFieldsValue,
  AddressMethodWords,
  Ipv4Method,
  Ipv6Method,
};
