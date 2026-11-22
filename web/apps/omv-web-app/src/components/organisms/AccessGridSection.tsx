// SPDX-License-Identifier: GPL-3.0-or-later
// The access grid of a shared folder (phase 5 shares design 3.2, 3.4; 0.4), the same component on a
// folder's page and in the add flow (section 6): the library's AccessGrid with this slice's words, one
// row per group and person (groups first, D2), each a choice of Read and write, Read only or No access
// (and Blocked only on a row that stores it, D3), the lines that say what a group adds or takes away,
// the administrator's row unavailable with its reason, and the grid's states (loading, the lists'
// failure with the server's words and a retry, no accounts with the classic Users page, filtered
// empty). Controlled: the caller holds the choices (accessModel's `Choices`) and saves them; the grid
// keeps only its search, filter and page.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { AccessGrid, ExternalLink } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { inertBidi, isolate, isolateName } from "../../format/isolate.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  allowedValues,
  GIVES_ACCESS,
  groupLine,
  NORMAL_ACCESS,
  valueOf,
  withChoice,
  type Access,
  type AccessModel,
  type AccessRow,
  type Choices,
} from "../../sharedFolders/accessModel.ts";

export interface AccessGridSectionProps {
  /** The table's name: "Who can use Photos". */
  label: string;
  /** The join of the lists and the stored access (accessModel); undefined while the lists are read. */
  model: AccessModel | undefined;
  /** The reader's choices, by row id; a row without one shows what it stores. */
  choices: Choices;
  /** The choices after a change in the grid (a row, or "Set all shown to"). Not a save. */
  onChoicesChange: (next: Record<string, Access>) => void;
  /** A list could not be read: the grid says so with the server's words and "Try again". */
  error?: { error: unknown; onRetry: () => void };
  /** A save is running: every row is unavailable and says "Saving…". */
  saving?: boolean;
  className?: string;
}

export function AccessGridSection({
  label,
  model,
  choices,
  onChoicesChange,
  error,
  saving = false,
  className,
}: AccessGridSectionProps) {
  const { t } = useTranslation();
  const accessWord = (access: Access) => t(`access.${access}`);

  const note = (row: AccessRow): string | null => {
    if (model === undefined) {
      return null;
    }
    const line = groupLine(row, model, choices);
    if (line === null) {
      return valueOf(row, choices) === "blocked"
        ? t("access.blockedHint")
        : null;
    }
    switch (line.kind) {
      case "viaGroup":
        return t("access.viaGroup", {
          access: accessWord(line.access),
          group: isolateName(line.group),
        });
      case "blockedVia":
        return t("access.blockedVia", { group: isolateName(line.group) });
      case "groupBlocks":
        return t("access.blockedByGroup", { group: isolateName(line.group) });
    }
  };

  const rows =
    model?.rows.map((row) => {
      const line = note(row);
      return {
        id: row.id,
        // Shown with their bidirectional controls as "�" (format/isolate.ts); rows are kept by id.
        name: inertBidi(row.name),
        description:
          row.description === "" ? undefined : inertBidi(row.description),
        notes: line === null ? undefined : [line],
        kind: t(`access.kind.${row.kind}`),
        value: valueOf(row, choices),
        initialValue: row.stored,
        allowedValues: allowedValues(row),
        unavailableReason: row.admin ? t("access.adminRow") : undefined,
      };
    }) ?? [];

  const change = (ids: readonly string[], value: Access) => {
    if (model !== undefined) {
      onChoicesChange(withChoice(model, choices, ids, value));
    }
  };

  return (
    <AccessGrid<Access>
      aria-label={label}
      className={className}
      columns={{
        name: t("access.col.name"),
        kind: t("access.col.kind"),
        access: t("access.col.access"),
      }}
      options={[
        { value: "rw", label: t("access.rw") },
        { value: "ro", label: t("access.ro") },
        { value: "none", label: t("access.none") },
        { value: "blocked", label: t("access.blocked") },
      ]}
      normalValues={NORMAL_ACCESS}
      accessValues={GIVES_ACCESS}
      rows={rows}
      onChange={(id, value) => change([id], value)}
      onSetAll={(ids, value) => change(ids, value)}
      rowLabel={(name) => t("access.rowLabel", { name: isolate(name) })}
      changedLabel={t("access.changed")}
      search={{
        label: t("access.search"),
        clearLabel: t("access.clearSearch"),
      }}
      show={{
        label: t("access.show.label"),
        all: t("access.show.all"),
        withAccess: t("access.show.withAccess"),
        changed: t("access.show.changed"),
      }}
      setAll={{
        label: t("access.setAll"),
        applyLabel: (count) => t("access.setAllApply", { count }),
      }}
      countText={(shown, total) => t("access.count", { shown, total })}
      filteredEmpty={{
        message: (search) => t("access.filtered", { search }),
        clearLabel: t("access.clearSearch"),
      }}
      pagination={{
        "aria-label": t("access.search"),
        pageSizeLabel: t("table.pageSize"),
        previous: {
          label: t("table.previous"),
          unavailableReason: t("table.firstPageReason"),
        },
        next: {
          label: t("table.next"),
          unavailableReason: t("table.lastPageReason"),
        },
        range: (first, last, shown) =>
          t("table.range", { from: first, to: last, total: shown }),
      }}
      loading={
        model === undefined && error === undefined
          ? { label: t("access.loading") }
          : undefined
      }
      error={
        error === undefined
          ? undefined
          : {
              message: t("access.loadFailed"),
              serverMessage: isRpcError(error.error)
                ? { label: t("app.serverMessage"), text: error.error.message }
                : undefined,
              retryLabel: t("common.tryAgain"),
              onRetry: error.onRetry,
            }
      }
      empty={{
        message: t("access.empty"),
        action: (
          <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
            {t("access.emptyLink")}
          </ExternalLink>
        ),
      }}
      saving={saving ? { label: t("access.saving") } : undefined}
    />
  );
}
