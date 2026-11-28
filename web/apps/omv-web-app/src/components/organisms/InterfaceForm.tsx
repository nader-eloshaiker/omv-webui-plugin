// SPDX-License-Identifier: GPL-3.0-or-later
// Set up or change a network interface (phase 5 network design 5 to 9; 0.5, 0.6, 0.8, 0.9, 1.4): a
// network port, Wi-Fi, a bond, a VLAN or a bridge. In place on an interface's page (change) and on the
// add pages (new). The kind's own fields, then the address part every kind shares, then Advanced, then
// Save and Cancel with the change's class under them (5.4, a polite live region that is part of Save's
// description) and what the change does to other computers (5.6).
//
// Saving (5.7, 0.9, R4): the connection is worked out again from fresh reads and the interface's stored
// settings are read again immediately before the write. When they changed since the form opened, the
// new settings are shown and nothing is written (5.8). A change that moves this page or may cut it off
// (0.5) is not saved here: Save reads "Review the change…" and opens the change flow in place of the
// form (1.4), with Back returning to these values. Anything else is saved straight to the band, with a
// toast and the pending mark. Refused changes (5.5, 0.8) keep Save unavailable with the reason.
//
// The Wi-Fi password (0.6, UI-6) is held only in this form's state while typed and in the one request
// (or the change flow's write, which drops it once written). It is cleared after every request and when
// the flow opens, and is never in a toast, the summary, the copied note, a query or a mutation cache.
import {
  useNetworkEnumerateBondSlaves,
  useNetworkEnumerateBridgeSlaves,
  useNetworkGetEthernetCandidates,
  useNetworkGetVlanCandidates,
  useNetworkGetWirelessCandidates,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  InlineAlert,
  IsolatedIdentifier,
  ServerMessage,
  Skeleton,
  useToast,
  type NowAfterRow,
} from "@omv-webui/react-ui-components";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useNetworkApi } from "../../hooks/useNetworkApi.ts";
import {
  storedList,
  useConnection,
  useNetworkDevices,
  useStoredInterface,
  useStoredInterfaces,
} from "../../hooks/useNetworkReads.ts";
import {
  opensFlow,
  useNetworkWords,
  useReviewButton,
} from "../../hooks/useNetworkWords.ts";
import { networkWrites } from "../../hooks/useNetworkWrites.ts";
import {
  confirmationFor,
  withoutSecrets,
  type FlowObject,
} from "../../network/changeFlow.ts";
import type { Connection, PageLocation } from "../../network/connection.ts";
import {
  NEW_OBJECT_UUID,
  toIfaceSettings,
  type DeviceRow,
  type GeneralSettings,
  type IfaceSettings,
  type Read,
} from "../../network/dto.ts";
import {
  advancedSet,
  afterOf,
  checkContext,
  devicenameOf,
  formProblems,
  initialDraft,
  memberChoices,
  nextFreeName,
  summaryRows,
  writeOf,
  type Candidate,
  type FormField,
  type FormProblem,
  type IfaceFormDraft,
  type RowValue,
} from "../../network/ifaceForm.ts";
import {
  blankSettings,
  changedFields,
  sameSettings,
  storedFor,
} from "../../network/ifaceModel.ts";
import {
  bothOffLine,
  classifyIfaceChange,
  familyRefusal,
  otherEffects,
  type Impact,
  type Refusal,
} from "../../network/impact.ts";
import { beginAction, endAction } from "../../network/networkSession.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { BondFields, ThisPageMember } from "../molecules/BondFields.tsx";
import { BridgeFields } from "../molecules/BridgeFields.tsx";
import { IfaceAddressPart } from "../molecules/IfaceAddressPart.tsx";
import { IfaceAdvancedFields } from "../molecules/IfaceAdvancedFields.tsx";
import { IfaceCandidateSelect } from "../molecules/IfaceCandidateSelect.tsx";
import { IfaceOtherEffect } from "../molecules/IfaceOtherEffect.tsx";
import { IfaceProblemText } from "../molecules/IfaceProblemText.tsx";
import { NetworkConnectionLine } from "../molecules/NetworkConnectionLine.tsx";
import { NetworkImpactLine } from "../molecules/NetworkImpactLine.tsx";
import { VlanFields } from "../molecules/VlanFields.tsx";
import { WifiFields } from "../molecules/WifiFields.tsx";
import { NetworkChangeFlow, type NetworkChange } from "./NetworkChangeFlow.tsx";

export type InterfaceKind = "ethernet" | "wifi" | "bond" | "vlan" | "bridge";

export interface InterfaceFormProps {
  mode: "new" | "change";
  kind: InterfaceKind;
  /** Change: the interface. New: an optional port handed over in memory. */
  devicename?: string;
  /** Change: the stored record's identifier. */
  uuid?: string;
  onCancel: () => void;
  /** Saved (to the band, or through the change flow): the interface's name as OMV gave it. */
  onSaved: (devicename: string) => void;
}

const Name = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** Reads that stay as they are while the form holds unsaved work (0.4: no refresh on focus). */
const FORM_READ = {
  refetchOnMount: "always",
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Number.POSITIVE_INFINITY,
} as const;

type CandidatesRead =
  | { state: "ok"; data: Candidate[] }
  | { state: "loading" }
  | { state: "failed"; error: unknown; retry: () => void };

/** The kind's candidate read (5.1, 6, 7, 8, 9): new ports and Wi-Fi, a VLAN's parents, a bond's or bridge's members. */
function useCandidates(
  kind: InterfaceKind,
  isNew: boolean,
  uuid: string,
): CandidatesRead | null {
  const on = (enabled: boolean) => ({ query: { ...FORM_READ, enabled } });
  const slaves = { uuid, unused: true };
  const ethernet = useNetworkGetEthernetCandidates(
    on(isNew && kind === "ethernet"),
  );
  const wifi = useNetworkGetWirelessCandidates(on(isNew && kind === "wifi"));
  const vlan = useNetworkGetVlanCandidates(on(isNew && kind === "vlan"));
  const bond = useNetworkEnumerateBondSlaves(slaves, on(kind === "bond"));
  const bridge = useNetworkEnumerateBridgeSlaves(slaves, on(kind === "bridge"));
  const query =
    kind === "bond"
      ? bond
      : kind === "bridge"
        ? bridge
        : !isNew
          ? null
          : kind === "ethernet"
            ? ethernet
            : kind === "wifi"
              ? wifi
              : vlan;
  if (query === null) {
    return null;
  }
  if (query.isError) {
    return {
      state: "failed",
      error: query.error,
      retry: () => void query.refetch(),
    };
  }
  return query.data === undefined
    ? { state: "loading" }
    : { state: "ok", data: query.data };
}

function LoadingFields() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t("ifaceForm.loading")}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ReadFailed({
  title,
  error,
  retry,
}: {
  title: ReactNode;
  error: unknown;
  retry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="error"
      serverMessage={
        isRpcError(error)
          ? { label: t("app.serverMessage"), text: error.message }
          : undefined
      }
      action={
        <Button variant="neutral" onClick={retry}>
          {t("common.tryAgain")}
        </Button>
      }
    >
      {title}
    </EmptyState>
  );
}

export function InterfaceForm(props: InterfaceFormProps): JSX.Element {
  const { t } = useTranslation();
  const { mode, kind, onCancel } = props;
  const isNew = mode === "new";
  const uuid = isNew ? NEW_OBJECT_UUID : (props.uuid ?? NEW_OBJECT_UUID);
  const reading = useConnection({ focus: false });
  const storedQuery = useStoredInterfaces({ focus: false });
  const readQuery = useStoredInterface(uuid, {
    enabled: !isNew && props.uuid !== undefined,
    focus: false,
  });
  const candidates = useCandidates(kind, isNew, uuid);
  const name = props.devicename ?? "";
  // While the change flow is open, the form (which holds it) stays whatever a read says meanwhile:
  // the NAS restarting its network after the flow's apply fails every read, and the flow's wait, moved
  // card and recovery card must stay (1.5). The flow reads again before it writes; the form's values
  // come back with Back as they were.
  const [flowOpen, setFlowOpen] = useState(false);
  const devicesQuery = useNetworkDevices({ focus: false });
  const devicesKept =
    reading.devices.state === "ok"
      ? reading.devices.data
      : flowOpen
        ? devicesQuery.data?.data
        : undefined;

  if (!isNew && props.uuid === undefined) {
    return (
      <EmptyState variant="error" title={t("ifaceForm.failed")}>
        <Trans
          i18nKey="ifaceForm.loadFailed"
          components={{ iface: <Name value={name} /> }}
        />
      </EmptyState>
    );
  }
  if (!flowOpen && !isNew && readQuery.isError) {
    return (
      <ReadFailed
        title={
          <Trans
            i18nKey="ifaceForm.loadFailed"
            components={{ iface: <Name value={name} /> }}
          />
        }
        error={readQuery.error}
        retry={() => void readQuery.refetch()}
      />
    );
  }
  if (
    !flowOpen &&
    (reading.devices.state === "failed" || storedQuery.isError)
  ) {
    return (
      <ReadFailed
        title={t("ifaceForm.readsFailed")}
        error={storedQuery.error}
        retry={() => {
          void storedQuery.refetch();
          void reading.refresh();
        }}
      />
    );
  }
  if (!flowOpen && candidates?.state === "failed") {
    return (
      <ReadFailed
        title={t("ifaceForm.candidatesFailed")}
        error={candidates.error}
        retry={candidates.retry}
      />
    );
  }
  if (
    devicesKept === undefined ||
    storedQuery.data === undefined ||
    (!flowOpen && candidates?.state === "loading") ||
    (!isNew && readQuery.data === undefined)
  ) {
    return <LoadingFields />;
  }

  const read =
    isNew || readQuery.data === undefined
      ? null
      : toIfaceSettings(readQuery.data);
  if (!isNew && read === null) {
    // A type or method OMV does not write: left to the classic interface rather than guessed at.
    return (
      <EmptyState variant="error" title={t("ifaceForm.failed")}>
        <Trans
          i18nKey="ifaceForm.loadFailed"
          components={{ iface: <Name value={name} /> }}
        />
      </EmptyState>
    );
  }
  const devices = devicesKept;
  const stored = storedList(storedQuery.data.data);
  const list = candidates?.state === "ok" ? candidates.data : [];
  const choices =
    kind === "bond" || kind === "bridge"
      ? memberChoices({
          kind,
          candidates: list,
          connection: reading.connection,
          devices,
          stored,
          own: read?.slaves ?? [],
        })
      : [];
  const noneKey =
    !isNew || kind === "bridge"
      ? null
      : kind === "bond"
        ? choices.some((c) => !c.thisPage)
          ? null
          : "ifaceForm.none.bond"
        : list.length > 0
          ? null
          : kind === "ethernet"
            ? "ifaceForm.none.port"
            : kind === "wifi"
              ? "ifaceForm.none.wifi"
              : "ifaceForm.none.vlan";
  if (!flowOpen && noneKey !== null) {
    return (
      <EmptyState
        variant="empty"
        action={
          <Button variant="neutral" onClick={onCancel}>
            {t("ifaceForm.backToList")}
          </Button>
        }
      >
        {t(noneKey)}
      </EmptyState>
    );
  }
  const port = isNew && list.some((c) => c.devicename === name) ? name : "";
  return (
    <InterfaceFormBody
      key={read?.uuid ?? "new"}
      kind={kind}
      read={read}
      port={port}
      candidates={list}
      choices={choices}
      devices={devices}
      stored={stored}
      connection={reading.connection}
      location={reading.location}
      general={reading.general}
      refresh={reading.refresh}
      onCancel={onCancel}
      onSaved={props.onSaved}
      onFlow={setFlowOpen}
    />
  );
}

type Failure =
  | { kind: "server"; error: unknown }
  | { kind: "unread"; error: unknown }
  | { kind: "running" }
  | { kind: "setUpElsewhere"; iface: string };

type Notice = "changedElsewhere" | "noChanges";

/** The selector of a field, for moving focus to the first refused one after Save. */
const FOCUS_KEY: Partial<Record<FormField, string>> = {
  address: "ipv4.address",
  size: "ipv4.size",
  gateway: "ipv4.router",
  address6: "ipv6.address",
  prefix6: "ipv6.prefix",
  gateway6: "ipv6.router",
  dnsnameservers: "dns.servers",
  dnssearch: "dns.search",
};
const ADVANCED: readonly FormField[] = [
  "mtu",
  "altmacaddress",
  "routemetric",
  "routemetric6",
];

function focusField(form: HTMLElement | null, field: FormField) {
  const holder = form?.querySelector<HTMLElement>(
    `[data-field="${FOCUS_KEY[field] ?? field}"]`,
  );
  if (holder === null || holder === undefined) {
    return;
  }
  const target = holder.matches("input, textarea, button, [tabindex]")
    ? holder
    : holder.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, button, [role=radio], [role=checkbox], [tabindex]",
      );
  target?.focus();
}

const SAVED_KEY = {
  ethernet: "ifaceForm.saved",
  wifi: "wifi.saved",
  bond: "bond.saved",
  vlan: "vlan.saved",
  bridge: "bridge.saved",
} as const satisfies Record<InterfaceKind, string>;

function RefusalText({ refusal }: { refusal: Refusal }) {
  const { t } = useTranslation();
  switch (refusal.code) {
    case "ifaceForm.refusedFamily":
      return (
        <>
          <Trans
            i18nKey="ifaceForm.refusedFamily"
            components={{
              family: <NodeSlot value={refusal.family} />,
              iface: <Name value={refusal.iface} />,
            }}
          />{" "}
          <Trans
            i18nKey="network.impact.otherWay"
            components={{ iface: <Name value={refusal.iface} /> }}
          />
        </>
      );
    case "bond.thisPagePort":
      return <ThisPageMember iface={refusal.iface} />;
    default:
      return t("ifaceForm.failed");
  }
}

function InterfaceFormBody({
  kind,
  read,
  port,
  candidates,
  choices,
  devices,
  stored,
  connection,
  location,
  general,
  refresh,
  onCancel,
  onSaved,
  onFlow,
}: {
  kind: InterfaceKind;
  read: IfaceSettings | null;
  port: string;
  candidates: readonly Candidate[];
  choices: ReturnType<typeof memberChoices>;
  devices: readonly DeviceRow[];
  stored: readonly IfaceSettings[];
  connection: Connection;
  location: PageLocation;
  general: Read<GeneralSettings>;
  refresh: ReturnType<typeof useConnection>["refresh"];
  onCancel: () => void;
  onSaved: (devicename: string) => void;
  /** Whether the change flow is open, for the form around it to keep it (InterfaceForm). */
  onFlow: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const words = useNetworkWords();
  const api = useNetworkApi();
  const writes = useMemo(() => networkWrites(api), [api]);
  const isNew = read === null;
  // The settings the form was opened with; replaced by the newer ones when they changed elsewhere (5.8).
  const [base, setBase] = useState<IfaceSettings | null>(read);
  const [draft, setDraft] = useState<IfaceFormDraft>(() =>
    initialDraft(read, port),
  );
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const [checkAll, setCheckAll] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(() => advancedSet(draft));
  // The Wi-Fi password, only while typed: cleared after every request and when the flow opens.
  const [password, setPassword] = useState("");
  const [secretKey, setSecretKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [change, setChange] = useState<NetworkChange | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    field: FormField;
    n: number;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Back from the change flow: focus returns to Save, with the values as they were (1.4).
  const backFromFlowRef = useRef(false);

  useEffect(() => {
    if (focusRequest !== null) {
      focusField(formRef.current, focusRequest.field);
    }
  }, [focusRequest]);

  useEffect(() => {
    onFlow(change !== null);
  }, [change, onFlow]);

  useEffect(() => {
    if (backFromFlowRef.current && change === null) {
      backFromFlowRef.current = false;
      saveRef.current?.focus();
    }
  }, [change]);

  const clearPassword = () => {
    setPassword("");
    setSecretKey((k) => k + 1);
  };

  const devicename = devicenameOf(kind, base, draft);
  const displayName =
    devicename !== ""
      ? devicename
      : kind === "bond"
        ? nextFreeName(stored, devices, "bond")
        : kind === "bridge"
          ? nextFreeName(stored, devices, "br")
          : "";
  const vlanParent =
    kind === "vlan" ? (base?.vlanrawdevice ?? draft.vlanrawdevice) : null;
  const context = checkContext({ devicename, devices, stored, vlanParent });
  const problems = formProblems({
    kind,
    isNew,
    draft,
    context,
    stored,
    password,
  });
  const problemOf = (field: FormField): FormProblem | undefined =>
    checkAll || shown.has(field)
      ? problems.find((p) => p.field === field)
      : undefined;
  const messageOf = (field: FormField): ReactNode => {
    const problem = problemOf(field);
    return problem === undefined ? undefined : (
      <IfaceProblemText problem={problem} />
    );
  };
  const show = (field: string) =>
    setShown((s) => (s.has(field) ? s : new Set([...s, field])));

  const live = devices.find((d) => d.devicename === devicename) ?? null;
  const after = afterOf(kind, base, draft);
  const ifaceChange = { connection, devicename, before: base, after, live };
  const impact: Impact = classifyIfaceChange(ifaceChange);
  const review = useReviewButton(impact);
  const refusal = familyRefusal(ifaceChange);
  const bothOff = bothOffLine(connection, displayName, after);
  const refusedFinding = impact.findings.find((f) => f.class === "refused");
  const others = otherEffects(displayName, base, after);
  const familyNote = (family: "IPv4" | "IPv6"): ReactNode =>
    refusal?.code === "ifaceForm.refusedFamily" && refusal.family === family ? (
      <RefusalText refusal={refusal} />
    ) : undefined;

  const update = (next: IfaceFormDraft) => {
    setFailure(null);
    setNotice(null);
    setDraft(next);
  };

  const rowsOf = (input: Parameters<typeof summaryRows>[0]): NowAfterRow[] => {
    const value = (v: RowValue): ReactNode => {
      switch (v.kind) {
        case "text":
          return inertBidi(v.text);
        case "key":
          return <>{t(v.key)}</>;
        case "bytes":
          return <>{t("netChange.note.mtuBytes", { size: v.size })}</>;
        case "classicMode":
          return <>{t("bond.mode.classic", { mode: v.mode })}</>;
        case "none":
          return <>{t("common.none")}</>;
      }
    };
    return summaryRows(input).map((row) => ({
      id: row.id,
      label: t(row.label),
      now: value(row.now),
      after: value(row.after),
      changed: row.changed,
    }));
  };

  const submit = async () => {
    if (saving) {
      return;
    }
    setCheckAll(true);
    setNotice(null);
    setFailure(null);
    const first = problems[0];
    if (first !== undefined) {
      if (ADVANCED.includes(first.field)) {
        setAdvancedOpen(true);
      }
      setFocusRequest((r) => ({ field: first.field, n: (r?.n ?? 0) + 1 }));
      return;
    }
    if (impact.class === "refused") {
      return;
    }
    if (
      base !== null &&
      kind !== "wifi" &&
      changedFields(base, after).length === 0
    ) {
      setNotice("noChanges");
      return;
    }
    const object: FlowObject = {
      kind: "iface",
      devicename: displayName,
      type: kind,
    };
    if (!beginAction(object)) {
      setFailure({ kind: "running" });
      return;
    }
    setSaving(true);
    // The request carries the typed password; this copy is the only one, and it is cleared below.
    const typed = password;
    try {
      const now = await refresh();
      let fresh: IfaceSettings | null = null;
      if (base !== null) {
        fresh = await api.rereads.iface(base.uuid);
        if (
          fresh === null ||
          !sameSettings(withoutSecrets(fresh), withoutSecrets(base))
        ) {
          if (fresh !== null) {
            const next = initialDraft(fresh);
            setBase(fresh);
            setDraft(next);
            setAdvancedOpen(advancedSet(next));
          }
          setShown(new Set());
          setCheckAll(false);
          setNotice("changedElsewhere");
          return;
        }
      }
      const storedNow = await api.rereads.stored();
      if (now.devices.state !== "ok") {
        setFailure({ kind: "unread", error: null });
        return;
      }
      const devicesNow = now.devices.data;
      if (
        isNew &&
        devicename !== "" &&
        storedFor(storedNow, devicename) !== null
      ) {
        setFailure({ kind: "setUpElsewhere", iface: devicename });
        return;
      }
      const contextNow = checkContext({
        devicename,
        devices: devicesNow,
        stored: storedNow,
        vlanParent,
      });
      const problemsNow = formProblems({
        kind,
        isNew,
        draft,
        context: contextNow,
        stored: storedNow,
        password: typed,
      });
      const firstNow = problemsNow[0];
      if (firstNow !== undefined) {
        // The fresh reads are in the cache: the next render shows the refusal.
        setFocusRequest((r) => ({ field: firstNow.field, n: (r?.n ?? 0) + 1 }));
        return;
      }
      const write = writeOf({
        kind,
        read: fresh,
        draft,
        context: contextNow,
        stored: storedNow,
        password: typed,
      });
      const liveNow =
        devicesNow.find((d) => d.devicename === devicename) ?? null;
      const impactNow = classifyIfaceChange({
        connection: now.connection,
        devicename,
        before: fresh,
        after: { ...write.request, type: kind },
        live: liveNow,
      });
      if (impactNow.class === "refused") {
        return;
      }
      if (opensFlow(impactNow)) {
        const flowAfter = { ...write.request, type: kind };
        const hostname =
          now.general.state === "ok" ? now.general.data.hostname : "";
        setChange({
          object,
          action: isNew ? "ifaceNew" : "ifaceChanged",
          rows: rowsOf({
            kind,
            before: fresh,
            after: flowAfter,
            live: liveNow,
          }),
          impact: impactNow,
          others: otherEffects(displayName, fresh, flowAfter).map((e, i) => ({
            id: `${e.code}-${String(i)}`,
            text: <IfaceOtherEffect effect={e} />,
          })),
          note:
            fresh !== null
              ? words.ifaceNote(fresh, liveNow)
              : liveNow !== null
                ? words.liveNote([liveNow])
                : words.ifaceNote(blankSettings(displayName, kind), null),
          confirmation: confirmationFor(object, impactNow, {
            members: draft.slaves,
          }),
          write: writes.iface({ before: fresh, write, impact: impactNow }),
          wifi: kind === "wifi",
          hostname,
        });
        return;
      }
      const saved = await api.setIface(write, impactNow);
      toast.show({
        title: t(SAVED_KEY[kind], { iface: isolateName(saved.devicename) }),
      });
      onSaved(saved.devicename);
    } catch (error) {
      setFailure({ kind: "server", error });
    } finally {
      clearPassword();
      setSaving(false);
      endAction(object);
    }
  };

  if (change !== null) {
    return (
      <NetworkChangeFlow
        change={change}
        onBack={() => {
          setChange(null);
          backFromFlowRef.current = true;
        }}
        onCancel={() => {
          setChange(null);
          onCancel();
        }}
        onDone={() => {
          setChange(null);
          onSaved(displayName);
        }}
      />
    );
  }

  const failureView = (() => {
    if (failure === null) {
      return null;
    }
    switch (failure.kind) {
      case "server":
      case "unread":
        return (
          <InlineAlert
            tone="critical"
            title={
              failure.kind === "unread"
                ? t("ifaceForm.readsFailed")
                : t("ifaceForm.failed")
            }
          >
            {isRpcError(failure.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {failure.error.message}
              </ServerMessage>
            ) : null}
          </InlineAlert>
        );
      case "running":
        return (
          <InlineAlert tone="critical" title={t("ifaceForm.failed")}>
            <Trans
              i18nKey="ifaceForm.running"
              components={{ iface: <Name value={displayName} /> }}
            />
          </InlineAlert>
        );
      case "setUpElsewhere":
        return (
          <InlineAlert tone="critical" title={t("ifaceForm.failed")}>
            <Trans
              i18nKey="ifaceForm.setUpElsewhere"
              components={{ iface: <Name value={failure.iface} /> }}
            />
          </InlineAlert>
        );
    }
  })();

  const disabled = saving;
  return (
    <form
      ref={formRef}
      noValidate
      aria-busy={saving || undefined}
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {isNew ? null : (
        <h2 className="text-section text-foreground [overflow-wrap:anywhere]">
          <Trans
            i18nKey="ifaceForm.titleChange"
            components={{ iface: <Name value={displayName} /> }}
          />
        </h2>
      )}
      <NetworkConnectionLine connection={connection} />
      {notice === "changedElsewhere" ? (
        <InlineAlert tone="neutral" icon="warning" role="alert">
          <Trans
            i18nKey="ifaceForm.changedElsewhere"
            components={{ iface: <Name value={displayName} /> }}
          />
        </InlineAlert>
      ) : null}
      {kind === "ethernet" && isNew ? (
        <IfaceCandidateSelect
          field="port"
          label={t("ifaceForm.port")}
          placeholder={t("ifaceForm.portPlaceholder")}
          candidates={candidates}
          value={draft.port}
          onChange={(next) => update({ ...draft, port: next })}
          onBlur={() => show("port")}
          error={messageOf("port")}
          disabled={disabled}
        />
      ) : null}
      {kind === "wifi" ? (
        <WifiFields
          isNew={isNew}
          candidates={candidates}
          draft={draft}
          onChange={update}
          onBlur={show}
          errors={{
            port: messageOf("port"),
            wpassid: messageOf("wpassid"),
            wpapsk: messageOf("wpapsk"),
          }}
          passwordStored={base?.wpapsk === true}
          secretKey={secretKey}
          onPasswordChange={(next) => {
            setFailure(null);
            setPassword(next);
          }}
          disabled={disabled}
        />
      ) : null}
      {kind === "bond" ? (
        <BondFields
          isNew={isNew}
          read={base}
          name={displayName}
          choices={choices}
          draft={draft}
          onChange={update}
          onBlur={show}
          errors={{
            slaves: messageOf("slaves"),
            bondprimary: messageOf("bondprimary"),
          }}
          disabled={disabled}
        />
      ) : null}
      {kind === "vlan" ? (
        <VlanFields
          isNew={isNew}
          candidates={candidates}
          draft={draft}
          name={isNew ? devicename : ""}
          onChange={update}
          onBlur={show}
          errors={{
            vlanrawdevice: messageOf("vlanrawdevice"),
            vlanid: messageOf("vlanid"),
          }}
          disabled={disabled}
        />
      ) : null}
      {kind === "bridge" ? (
        <BridgeFields
          isNew={isNew}
          name={displayName}
          choices={choices}
          draft={draft}
          onChange={update}
          disabled={disabled}
        />
      ) : null}

      <IfaceAddressPart
        draft={draft.address}
        onChange={(address) => update({ ...draft, address })}
        onBlur={show}
        errors={{
          address: messageOf("address"),
          size: messageOf("size"),
          gateway: messageOf("gateway"),
          address6: messageOf("address6"),
          prefix6: messageOf("prefix6"),
          gateway6: messageOf("gateway6"),
          dnsnameservers: messageOf("dnsnameservers"),
          dnssearch: messageOf("dnssearch"),
        }}
        familyNotes={{
          ipv4: familyNote("IPv4"),
          ipv6:
            familyNote("IPv6") ??
            (bothOff === null || refusal !== null ? undefined : (
              <Trans
                i18nKey="ifaceForm.bothOff"
                components={{ iface: <Name value={bothOff.iface} /> }}
              />
            )),
        }}
        domain={general.state === "ok" ? general.data.domainname : ""}
        disabled={disabled}
        disabledReason={disabled ? t("ifaceForm.saving") : undefined}
      />

      <IfaceAdvancedFields
        kind={kind}
        draft={draft}
        onChange={update}
        onBlur={show}
        errors={{
          mtu: messageOf("mtu"),
          altmacaddress: messageOf("altmacaddress"),
          routemetric: messageOf("routemetric"),
          routemetric6: messageOf("routemetric6"),
        }}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        disabled={disabled}
      />

      {/* 5.8: a refusal by OMV under the form, the values kept. */}
      {failureView}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            ref={saveRef}
            type="submit"
            variant="primary"
            loading={saving}
            aria-describedby={review.impactLineId}
            disabled={review.refused}
            focusableWhenDisabled
          >
            {saving ? t("ifaceForm.saving") : review.label}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={saving}
            onClick={onCancel}
          >
            {t("ifaceForm.cancel")}
          </Button>
        </div>
        {notice === "noChanges" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("common.noChanges")}
          </p>
        ) : null}
        <NetworkImpactLine
          id={review.impactLineId}
          impact={impact}
          location={location}
          refusal={
            refusedFinding?.class === "refused" ? (
              <RefusalText refusal={refusedFinding.refusal} />
            ) : undefined
          }
        />
        {others.length > 0 ? (
          <ul className="flex max-w-prose list-disc flex-col gap-1 ps-5 text-sm">
            {others.map((effect, i) => (
              <li key={`${effect.code}-${String(i)}`}>
                <IfaceOtherEffect effect={effect} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
