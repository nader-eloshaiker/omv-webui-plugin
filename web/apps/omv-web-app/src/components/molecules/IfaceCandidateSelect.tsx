// SPDX-License-Identifier: GPL-3.0-or-later
// A choice of interface for a new one (phase 5 network design 5.2 item 1, 6.1 item 1, 8.1 item 2):
// the port to set up, the Wi-Fi hardware, or what a VLAN runs on, each named with its hardware address
// and its connection ("enp3s0 · 00:00:5e:00:53:02 · Not connected"). Names come from the NAS: text,
// isolated, with any bidirectional control shown (UI-2).
import {
  IsolatedIdentifier,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@omv-webui/react-ui-components";
import { useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import type { Candidate } from "../../network/ifaceForm.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";

/** "Connected at 1 Gbit/s", "Connected", "Not connected" (the monitoring domain's words, 0.3). */
function useConnectionWords() {
  const { t } = useTranslation();
  const format = useFormat();
  return (c: Pick<Candidate, "link" | "speed">): string => {
    if (!c.link) {
      return t("dashboard.network.notConnected");
    }
    const speed = format.speed(c.speed);
    return speed === null
      ? t("dashboard.network.connected")
      : t("dashboard.network.connectedAt", { speed });
  };
}

export function CandidateWords({ candidate }: { candidate: Candidate }) {
  const words = useConnectionWords();
  const mac = candidate.ether.trim();
  return (
    <Trans
      i18nKey="ifaceForm.portOption"
      components={{
        name: <IsolatedIdentifier value={inertBidi(candidate.devicename)} />,
        mac: <IsolatedIdentifier value={mac === "" ? "–" : mac} />,
        connection: <NodeSlot value={words(candidate)} />,
      }}
    />
  );
}

export function IfaceCandidateSelect({
  field,
  label,
  placeholder,
  candidates,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: {
  /** The form's field, for focus after Save. */
  field: string;
  label: ReactNode;
  placeholder: string;
  candidates: readonly Candidate[];
  value: string;
  onChange: (devicename: string) => void;
  onBlur?: () => void;
  error?: ReactNode;
  disabled: boolean;
}) {
  const errorId = useId();
  return (
    <div data-field={field} className="flex flex-col gap-1">
      <Select
        items={candidates.map((c) => ({
          value: c.devicename,
          label: <CandidateWords candidate={c} />,
        }))}
        value={value === "" ? null : value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            onBlur?.();
          }
        }}
      >
        <SelectLabel>{label}</SelectLabel>
        <SelectTrigger
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-full max-w-md"
        />
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.devicename} value={c.devicename}>
              <CandidateWords candidate={c} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-sm text-critical-label">
          {error}
        </p>
      ) : null}
    </div>
  );
}
