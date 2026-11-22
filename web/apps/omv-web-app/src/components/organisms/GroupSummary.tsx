// SPDX-License-Identifier: GPL-3.0-or-later
// A group's summary card (phase 5 users design 9.2 item 3): its name with why it cannot be renamed,
// its description edited in place (9.3), how many members it has, and its group number under
// Technical details. Server text as text (UI-2).
import type { UserGroup } from "@omv-webui/react-api-omv/generated";
import {
  Card,
  CardContent,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { GroupDescription } from "./GroupDescription.tsx";

export function GroupSummary({
  group,
  memberCount,
  descriptionPending,
  editing,
  onEditingChange,
  onSaved,
  onShowCurrent,
}: {
  group: UserGroup;
  /** Its members, people whose main group it is included. */
  memberCount: number;
  descriptionPending: boolean;
  editing: string | null;
  onEditingChange: (draft: string | null) => void;
  onSaved: () => void;
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <FactList>
          <FactListItem>
            <FactListLabel>{t("group.fact.name")}</FactListLabel>
            <FactListValue>
              <span className="flex flex-col items-start gap-1">
                <Identifier dir="auto" className="[overflow-wrap:anywhere]">
                  {inertBidi(group.name)}
                </Identifier>
                <Disclosure>
                  <DisclosureTrigger variant="inline">
                    {t("group.rename.why", { group: isolateName(group.name) })}
                  </DisclosureTrigger>
                  <DisclosurePanel>
                    <p className="max-w-prose text-sm text-muted-foreground">
                      {t("group.rename.body")}
                    </p>
                  </DisclosurePanel>
                </Disclosure>
              </span>
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("group.fact.description")}</FactListLabel>
            <FactListValue>
              <GroupDescription
                group={group}
                pending={descriptionPending}
                editing={editing}
                onEditingChange={onEditingChange}
                onSaved={onSaved}
                onShowCurrent={onShowCurrent}
              />
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("group.fact.members")}</FactListLabel>
            <FactListValue>
              {memberCount === 0
                ? t("groups.nobody")
                : t("groups.membersCount", { count: memberCount })}
            </FactListValue>
          </FactListItem>
        </FactList>
        <Disclosure>
          <DisclosureTrigger>{t("group.fact.technical")}</DisclosureTrigger>
          <DisclosurePanel>
            <FactList>
              <FactListItem>
                <FactListLabel>{t("group.fact.number")}</FactListLabel>
                <FactListValue>
                  <span className="tabular-nums">
                    {group.gid === undefined
                      ? t("common.notAvailable")
                      : String(group.gid)}
                  </span>
                </FactListValue>
              </FactListItem>
            </FactList>
          </DisclosurePanel>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
