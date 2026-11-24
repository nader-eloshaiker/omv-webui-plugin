// SPDX-License-Identifier: GPL-3.0-or-later
// The command palette, "Go to or do…" (foundation 13), and the keys that reach it: `/` or Ctrl+K
// (Cmd+K) opens it; `g` then a letter jumps to a page (navigation.ts JUMP_KEYS), ignored while typing.
// It lists every page of the navigation the session's role sees, classic pages marked, and, for an
// administrator with changes waiting, "Apply N pending changes", which opens the band's own apply
// confirmation (pending/requests.ts). Nothing else for now: it only navigates and asks to apply.
import type { Role } from "@omv-webui/react-api-omv/generated";
import {
  CommandPalette,
  useCommandKeys,
  type CommandItem,
} from "@omv-webui/react-ui-components";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useNavGroups } from "../../hooks/useNavGroups.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import {
  builtRoute,
  jumpKeyFor,
  type NavPageEntry,
} from "../../navigation/navigation.ts";
import { isKnownModule, pendingModules } from "../../pending/modules.ts";
import { requestApply } from "../../pending/requests.ts";

export function ShellPalette({
  role,
  open,
  onOpenChange,
}: {
  role: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const groups = useNavGroups(role);
  const admin = role === "admin";
  const info = useSystemInformation();
  const modules = admin ? pendingModules(info.data?.dirtyModules) : [];
  const dirty =
    admin && (info.data?.configDirty === true || modules.length > 0);

  const goTo = (page: NavPageEntry) => {
    const built = builtRoute(page);
    if (built) {
      void navigate({ to: built });
    } else {
      void navigate({
        to: "/$group/$item",
        params: { group: page.group, item: page.item },
      });
    }
  };

  const go = t("palette.groupGo");
  const keysFor = (route: Parameters<typeof jumpKeyFor>[0]) => {
    const key = jumpKeyFor(route);
    return key ? ["g", key] : undefined;
  };

  const items: CommandItem[] = [
    ...(dirty
      ? [
          {
            id: "apply",
            label:
              modules.length > 0
                ? t("palette.apply", { count: modules.length })
                : t("palette.applyAll"),
            group: t("palette.groupDo"),
            // A plugin's module id is shown as itself, as text (UI-2).
            hint: modules
              .map((id) => (isKnownModule(id) ? t(`modules.${id}`) : id))
              .join(", "),
            onSelect: requestApply,
          },
        ]
      : []),
    {
      id: "dashboard",
      label: t("nav.dashboard"),
      group: go,
      shortcut: keysFor("/"),
      onSelect: () => void navigate({ to: "/" }),
    },
    ...groups.flatMap(({ group, pages }) =>
      pages.map((page): CommandItem => {
        const built = builtRoute(page);
        const groupName = t(`nav.groups.${group}`);
        return {
          id: `${page.group}/${page.item}`,
          label: t(page.labelKey),
          group: go,
          hint: built
            ? groupName
            : t("palette.classicHint", { group: groupName }),
          keywords: [page.item],
          external: built === undefined,
          shortcut: built ? keysFor(built) : undefined,
          onSelect: () => goTo(page),
        };
      }),
    ),
    ...(admin
      ? [
          {
            id: "add-ons",
            label: t("nav.addOns"),
            group: go,
            hint: t("palette.classicHint", { group: t("nav.addOns") }),
            external: true,
            onSelect: () => void navigate({ to: "/add-ons" }),
          },
        ]
      : []),
  ];

  const jumps: Record<string, () => void> = {};
  const dashboardKey = jumpKeyFor("/");
  if (dashboardKey) {
    jumps[dashboardKey] = () => void navigate({ to: "/" });
  }
  for (const { pages } of groups) {
    for (const page of pages) {
      const built = builtRoute(page);
      const key = built ? jumpKeyFor(built) : undefined;
      if (built && key) {
        jumps[key] = () => void navigate({ to: built });
      }
    }
  }
  useCommandKeys({
    onOpenPalette: () => onOpenChange(true),
    jumps,
    enabled: !open,
  });

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      label={t("palette.label")}
      inputLabel={t("palette.input")}
      emptyMessage={(query) => t("palette.empty", { query })}
      closeLabel={t("palette.close")}
      keysHint={t("palette.keys")}
      externalLabel={t("palette.external")}
    />
  );
}
