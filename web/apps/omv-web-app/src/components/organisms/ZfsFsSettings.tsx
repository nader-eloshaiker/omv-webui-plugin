// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS file system's settings (phase 5 ZFS design 4.4): its size limit and its compression, a
// settings form by Phase 3's rules (read, edit, Save, the saved line, the pending mark). Save reads the
// file system again first (R4), refuses a limit below what it holds, and sends only what changed, each
// item marked modified (the plugin skips the others). The changes go to the band (0.9). Read-only
// while the pool is Unknown or cannot be used.
import type { ZfsObject } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  PageSection,
  RadioGroupField,
  RadioOption,
  ServerMessage,
  SizeField,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import {
  compressionWord,
  findFs,
  limitFields,
  quotaBytes,
  quotaValue,
} from "../../zfs/zfsModel.ts";
import { recordSaved } from "../../zfs/zfsSession.ts";

type Compression = "lz4" | "off" | "keep";

const initialCompression = (row: ZfsObject): Compression => {
  const word = compressionWord(row.compression);
  return word === "off" ? "off" : word === "lz4" ? "lz4" : "keep";
};

export function ZfsFsSettings({
  row,
  readOnly,
  onSaved,
}: {
  row: ZfsObject;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const api = useZfsApi();
  const start = limitFields(row.size);
  const [limited, setLimited] = useState(row.size !== null);
  const [amount, setAmount] = useState(start.amount);
  const [unit, setUnit] = useState<"G" | "T">(start.unit);
  const [compression, setCompression] = useState<Compression>(() =>
    initialCompression(row),
  );
  const [problem, setProblem] = useState<
    "invalid" | "small" | "changed" | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<false | "pending" | "nothing">(false);
  const [error, setError] = useState<unknown>(null);
  // A new read of the row resets the form, during render.
  const [seen, setSeen] = useState(row);
  if (
    seen.path !== row.path ||
    seen.size !== row.size ||
    seen.compression !== row.compression
  ) {
    setSeen(row);
    const next = limitFields(row.size);
    setLimited(row.size !== null);
    setAmount(next.amount);
    setUnit(next.unit);
    setCompression(initialCompression(row));
  }

  const otherKind =
    compressionWord(row.compression) === "other" ||
    compressionWord(row.compression) === "on";
  const save = async () => {
    if (saving || readOnly) {
      return;
    }
    setError(null);
    setSaved(false);
    const limit = limited ? { amount, unit } : null;
    const value = quotaValue(limit);
    if (value === null) {
      setProblem("invalid");
      return;
    }
    setSaving(true);
    try {
      const fresh = findFs(await api.list(), row.path);
      if (
        fresh === undefined ||
        fresh.size !== row.size ||
        fresh.compression !== row.compression
      ) {
        setProblem("changed");
        onSaved();
        return;
      }
      if (limit !== null && quotaBytes(limit.amount, limit.unit) < fresh.used) {
        setProblem("small");
        return;
      }
      const properties: (
        | { property: "quota"; value: string; modified: true }
        | { property: "compression"; value: "lz4" | "off"; modified: true }
      )[] = [];
      const before = limitFields(row.size);
      const limitChanged =
        limited !== (row.size !== null) ||
        (limited && (before.amount !== amount || before.unit !== unit));
      if (limitChanged) {
        properties.push({ property: "quota", value, modified: true });
      }
      if (compression !== "keep" && compression !== initialCompression(row)) {
        properties.push({
          property: "compression",
          value: compression,
          modified: true,
        });
      }
      if (properties.length === 0) {
        setProblem(null);
        setSaved("nothing");
        return;
      }
      await api.setProperties({
        type: "Filesystem",
        name: row.path,
        properties,
      });
      recordSaved(row.path);
      setProblem(null);
      setSaved("pending");
      onSaved();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  const limitError =
    problem === "invalid"
      ? t("zfsFsAdd.limitInvalid")
      : problem === "small"
        ? t("zfsFsSettings.limitTooSmall", { used: formatBytes(row.used) })
        : undefined;

  return (
    <PageSection heading={t("zfsFsSettings.title")}>
      {readOnly ? (
        <p className="max-w-prose">{t("zfsFsSettings.readOnly")}</p>
      ) : null}
      <RadioGroupField
        legend={t("zfsFsAdd.limit")}
        hint={t("zfsFsSettings.limitHint")}
        value={limited ? "upTo" : "none"}
        disabled={readOnly}
        onValueChange={(value) => {
          setLimited(value === "upTo");
          setProblem(null);
          setSaved(false);
        }}
      >
        <RadioOption value="none" label={t("zfsFsAdd.limitNone")} />
        <RadioOption value="upTo" label={t("zfsFsAdd.limitUpTo")} />
      </RadioGroupField>
      {limited ? (
        <SizeField
          label={t("zfsFsAdd.limitAmount")}
          value={amount}
          onValueChange={(next) => {
            setAmount(next);
            setProblem(null);
            setSaved(false);
          }}
          unit={unit}
          units={[
            { value: "G", label: t("format.gib") },
            { value: "T", label: t("format.tib") },
          ]}
          onUnitChange={(next) => setUnit(next === "T" ? "T" : "G")}
          unitLabel={t("zfsFsAdd.unit")}
          error={limitError}
          disabled={readOnly}
        />
      ) : null}
      <RadioGroupField
        legend={t("zfsFsSettings.compression")}
        hint={t("zfsFsSettings.compressionHint")}
        value={compression}
        disabled={readOnly}
        onValueChange={(value) => {
          setCompression(
            value === "lz4" ? "lz4" : value === "off" ? "off" : "keep",
          );
          setSaved(false);
        }}
      >
        <RadioOption value="lz4" label={t("zfsFsSettings.compressionOn")} />
        <RadioOption value="off" label={t("zfsFsSettings.compressionOff")} />
        {otherKind ? (
          <RadioOption
            value="keep"
            label={t("zfsFsSettings.compressionKeep", {
              value: row.compression ?? "",
            })}
          />
        ) : null}
      </RadioGroupField>
      {problem === "changed" ? (
        <InlineAlert tone="neutral" title={t("zfsFsSettings.changed")} />
      ) : null}
      {error === null ? null : (
        <InlineAlert tone="critical" title={t("zfsFsSettings.saveFailed")}>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={saving}
          disabled={readOnly}
          focusableWhenDisabled
          onClick={() => void save()}
        >
          {saving ? t("zfsFsSettings.saving") : t("zfsFsSettings.save")}
        </Button>
        <p role="status" className="text-sm">
          {saved === "pending"
            ? t("common.savedPending")
            : saved === "nothing"
              ? t("zfsFsSettings.nothingChanged")
              : ""}
        </p>
      </div>
    </PageSection>
  );
}
