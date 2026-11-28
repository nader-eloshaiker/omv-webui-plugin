// SPDX-License-Identifier: GPL-3.0-or-later
// "Remove its settings" on an interface's page (phase 5 network design 4.2 item 8, 10; 0.5, 0.8, D7,
// P13): a card apart at the end, with one sentence and "Remove settings…", or the refusal's reason in
// its place (10.1): this page's interface or one under it (with how to do it safely), or a VLAN that
// runs on it (with a router link to the VLAN). The confirmation is the destructive form without typing
// (nothing on a disk is lost, and Undo brings it back before apply), naming the interface and what is
// lost. When the page cannot tell which interface it uses, the removal May cut this page off (0.5), so
// it goes through the change flow instead. Every rule is checked again from fresh reads just before
// the call (0.8); the write goes through useNetworkApi with the removal's class (for the band, 1.8).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  ConfirmDialog,
  IsolatedIdentifier,
  useToast,
  type NowAfterRow,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useNetworkApi } from "../../hooks/useNetworkApi.ts";
import type { useConnection } from "../../hooks/useNetworkReads.ts";
import { useNetworkWords } from "../../hooks/useNetworkWords.ts";
import { useNetworkWrites } from "../../hooks/useNetworkWrites.ts";
import { confirmationFor } from "../../network/changeFlow.ts";
import type { Connection } from "../../network/connection.ts";
import type { DeviceRow, IfaceSettings } from "../../network/dto.ts";
import {
  addressInUse,
  removalLosses,
  type RemovalLoss,
} from "../../network/ifaceModel.ts";
import {
  classifyRemoval,
  type Impact,
  type Refusal,
} from "../../network/impact.ts";
import { beginAction, endAction } from "../../network/networkSession.ts";
import { IfaceLink } from "../atoms/IfaceLink.tsx";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import type { NetworkChange } from "./NetworkChangeFlow.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** Names as one isolated run each, separated by commas. */
function Names({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={name}>
          {i > 0 ? ", " : null}
          <Value value={name} />
        </span>
      ))}
    </>
  );
}

/** The reason in place of the button (10.1), with how to do it safely where there is a way. */
export function RemovalRefusalText({ refusal }: { refusal: Refusal }) {
  let reason: ReactNode;
  switch (refusal.code) {
    case "ifaceDelete.refusedThis":
      reason = (
        <Trans
          i18nKey="ifaceDelete.refusedThis"
          components={{ iface: <Value value={refusal.iface} /> }}
        />
      );
      break;
    case "ifaceDelete.refusedUnder":
      reason = (
        <Trans
          i18nKey="ifaceDelete.refusedUnder"
          components={{
            top: <IfaceLink devicename={refusal.top} />,
            iface: <Value value={refusal.iface} />,
          }}
        />
      );
      break;
    case "ifaceDelete.refusedVlan":
      reason = (
        <Trans
          i18nKey="ifaceDelete.refusedVlan"
          components={{
            vlan: <IfaceLink devicename={refusal.vlan} />,
            iface: <Value value={refusal.iface} />,
          }}
        />
      );
      break;
    default:
      reason = null;
  }
  return (
    <p className="max-w-prose">
      {reason}
      {refusal.otherWay && "iface" in refusal ? (
        <>
          {" "}
          <Trans
            i18nKey="network.impact.otherWay"
            components={{ iface: <Value value={refusal.iface} /> }}
          />
        </>
      ) : null}
    </p>
  );
}

/** One line of what else is lost (10.2 item 3). */
function LossLine({ loss }: { loss: RemovalLoss }) {
  const { t } = useTranslation();
  switch (loss.code) {
    case "ifaceDelete.usesNow":
      return (
        <Trans
          i18nKey="ifaceDelete.usesNow"
          components={{
            addresses: <NodeSlot value={<Names names={loss.addresses} />} />,
          }}
        />
      );
    case "ifaceDelete.bondPorts":
      return (
        <Trans
          i18nKey="ifaceDelete.bondPorts"
          components={{
            ports: <NodeSlot value={<Names names={loss.ports} />} />,
          }}
        />
      );
    case "ifaceDelete.bridgeMembers":
      return (
        <Trans
          i18nKey="ifaceDelete.bridgeMembers"
          components={{
            members: <NodeSlot value={<Names names={loss.members} />} />,
          }}
        />
      );
    case "ifaceDelete.fixed":
      return (
        <Trans
          i18nKey="ifaceDelete.fixed"
          components={{ address: <Value value={loss.address} /> }}
        />
      );
    case "ifaceDelete.wifi":
    case "ifaceDelete.wol":
      return t(loss.code);
  }
}

export function IfaceRemoveSection({
  settings,
  live,
  devices,
  stored,
  connection,
  refresh,
  hostname,
  onReview,
  onRemoved,
}: {
  settings: IfaceSettings;
  /** What the interface uses now, when it is there. */
  live: DeviceRow | null;
  devices: readonly DeviceRow[];
  stored: readonly IfaceSettings[];
  connection: Connection;
  refresh: ReturnType<typeof useConnection>["refresh"];
  /** The NAS's name as read, for the flow's recovery steps. */
  hostname: string;
  /** The removal May cut this page off: review it in the change flow (1.4). */
  onReview: (change: NetworkChange) => void;
  /** The settings are removed (saved to the band). */
  onRemoved: (settings: IfaceSettings) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = useNetworkApi();
  const writes = useNetworkWrites();
  const words = useNetworkWords();
  const headingId = useId();
  const openRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const name = settings.devicename;
  const impact = classifyRemoval({
    connection,
    devicename: name,
    devices,
    stored,
  });
  const refused = impact.findings.find((f) => f.class === "refused");
  const losses = removalLosses(settings, live);
  const usesNow = losses.find((l) => l.code === "ifaceDelete.usesNow");
  const others = losses.filter((l) => l.code !== "ifaceDelete.usesNow");
  const object = {
    kind: "iface",
    devicename: name,
    type: settings.type,
  } as const;

  /** The change the flow reviews when the page cannot tell which interface it uses (0.5). */
  const flowChange = (
    before: IfaceSettings,
    classified: Impact,
  ): NetworkChange => {
    const none = t("interfaces.noAddress");
    const rows: NowAfterRow[] =
      live === null
        ? []
        : ([4, 6] as const).map((family) => ({
            id: `ipv${String(family)}`,
            label: family === 4 ? t("iface.fact.ipv4") : t("iface.fact.ipv6"),
            now: addressInUse(live, family)?.text ?? none,
            after: none,
            changed: addressInUse(live, family) !== null,
          }));
    return {
      object,
      action: "ifaceRemoved",
      rows,
      impact: classified,
      others: others.map((loss, i) => ({
        id: `${loss.code}:${String(i)}`,
        text: <LossLine loss={loss} />,
      })),
      note: words.ifaceNote(before, live),
      confirmation: confirmationFor(object, classified),
      write: writes.removeIface({ before, impact: classified }),
      hostname,
    };
  };

  const begin = async () => {
    setError(null);
    if (impact.class === "mayCut" || impact.class === "moves") {
      try {
        const before = await api.rereads.iface(settings.uuid);
        if (before !== null) {
          onReview(flowChange(before, impact));
        }
      } catch (failure) {
        setError(isRpcError(failure) ? failure.message : null);
      }
      return;
    }
    setOpen(true);
  };

  const confirm = async () => {
    if (pending) {
      return;
    }
    if (!beginAction(object)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      // 0.8: checked again from fresh reads immediately before the call.
      const [fresh, reading, storedNow] = await Promise.all([
        api.rereads.iface(settings.uuid),
        refresh(),
        api.rereads.stored(),
      ]);
      if (fresh === null) {
        setError(t("ifaceDelete.failed"));
        return;
      }
      const now = classifyRemoval({
        connection: reading.connection,
        devicename: name,
        devices:
          reading.devices.state === "ok" ? reading.devices.data : devices,
        stored: storedNow,
      });
      if (now.class === "refused") {
        // The section shows the reason from the fresh reads.
        setOpen(false);
        return;
      }
      if (now.class === "mayCut" || now.class === "moves") {
        setOpen(false);
        onReview(flowChange(fresh, now));
        return;
      }
      await api.deleteInterface({ uuid: fresh.uuid, devicename: name }, now);
      setOpen(false);
      toast.show({
        title: (
          <Trans
            i18nKey="ifaceDelete.done"
            components={{ iface: <Value value={name} /> }}
          />
        ),
      });
      onRemoved(settings);
    } catch (failure) {
      setError(isRpcError(failure) ? failure.message : t("ifaceDelete.failed"));
    } finally {
      endAction(object);
      setPending(false);
    }
  };

  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex flex-col gap-group p-4"
    >
      <h2 id={headingId} className="text-section text-foreground">
        {t("ifaceDelete.section")}
      </h2>
      {refused?.class === "refused" ? (
        <RemovalRefusalText refusal={refused.refusal} />
      ) : (
        <>
          <p className="max-w-prose">{t("ifaceDelete.sectionBody")}</p>
          <div>
            <Button
              ref={openRef}
              variant="neutral"
              onClick={() => void begin()}
            >
              {t("ifaceDelete.open")}
            </Button>
          </div>
          {!open && error !== null ? (
            <p role="alert" className="text-sm text-critical-label">
              {error}
            </p>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) {
            setOpen(false);
            setError(null);
          }
        }}
        variant="destructive"
        title={
          <Trans
            i18nKey="ifaceDelete.title"
            components={{ iface: <Value value={name} /> }}
          />
        }
        description={
          <>
            <Trans
              i18nKey="ifaceDelete.body"
              components={{ iface: <Value value={name} /> }}
            />
            {usesNow === undefined ? null : (
              <>
                {" "}
                <LossLine loss={usesNow} />
              </>
            )}
          </>
        }
        confirmLabel={t("ifaceDelete.confirm")}
        cancelLabel={t("ifaceDelete.cancel")}
        pending={pending}
        error={error ?? undefined}
        onConfirm={() => void confirm()}
      >
        {others.length === 0 ? null : (
          <ul className="flex list-disc flex-col gap-1 ps-5">
            {others.map((loss, i) => (
              <li key={`${loss.code}:${String(i)}`}>
                <LossLine loss={loss} />
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </Card>
  );
}
