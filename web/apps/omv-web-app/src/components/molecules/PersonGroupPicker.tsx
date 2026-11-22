// SPDX-License-Identifier: GPL-3.0-or-later
// The group picker (phase 5 users design 4.1, B5): one checkbox per group made in OMV, in natural order
// of name, each with its description; a search and "Show: All groups / Groups {{name}} is in" above ten
// groups; paged at 50; "In {{count}} of {{total}} groups." System groups are never offered (0.5). The
// library's MemberPicker with this slice's words. Controlled: the caller holds the ticks.
import type { UserGroup } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { MemberPicker } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { byName } from "../../users/usersList.ts";

export function PersonGroupPicker({
  name,
  groups,
  value,
  initialValue,
  onChange,
  error,
  saving = false,
  ...props
}: {
  /** The person's name, for "Groups {{name}} is in". */
  name: string;
  /** The OMV groups; undefined while read. */
  groups: readonly UserGroup[] | undefined;
  value: readonly string[];
  initialValue: readonly string[];
  onChange: (value: string[]) => void;
  /** The groups could not be read. */
  error?: { error: unknown; onRetry: () => void };
  saving?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  const { t } = useTranslation();
  const rows = [...(groups ?? [])]
    .sort((a, b) => byName(a.name, b.name))
    .map((g) => ({
      id: g.name,
      name: inertBidi(g.name),
      description:
        g.comment === undefined || g.comment === ""
          ? undefined
          : inertBidi(g.comment),
    }));
  return (
    <MemberPicker
      {...props}
      rows={rows}
      value={value}
      initialValue={initialValue}
      onChange={(next) => onChange(next)}
      changedLabel={t("access.changed")}
      search={{
        label: t("personGroups.search"),
        clearLabel: t("access.clearSearch"),
      }}
      show={{
        label: t("personGroups.show.label"),
        all: t("personGroups.show.all"),
        ticked: t("personGroups.show.member", { name: isolateName(name) }),
      }}
      countText={(count, total) => t("personGroups.count", { count, total })}
      filteredEmpty={{
        message: (search) => t("personGroups.filtered", { search }),
        clearLabel: t("access.clearSearch"),
      }}
      pagination={{
        "aria-label": t("personGroups.search"),
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
        groups === undefined && error === undefined
          ? { label: t("app.loading") }
          : undefined
      }
      error={
        error === undefined
          ? undefined
          : {
              message: t("personGroups.loadFailed"),
              serverMessage: isRpcError(error.error)
                ? { label: t("app.serverMessage"), text: error.error.message }
                : undefined,
              retryLabel: t("common.tryAgain"),
              onRetry: error.onRetry,
            }
      }
      empty={{
        message: `${t("personGroups.empty")} ${t("shares.term.group")}`,
        action: (
          <Link to="/usermgmt/groups/add" className={routerLinkClass}>
            {t("personGroups.emptyLink")}
          </Link>
        ),
      }}
      saving={saving ? { label: t("personGroups.saving") } : undefined}
    />
  );
}
