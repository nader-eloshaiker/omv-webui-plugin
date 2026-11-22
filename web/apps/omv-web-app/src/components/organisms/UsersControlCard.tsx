// SPDX-License-Identifier: GPL-3.0-or-later
// "Who can control this NAS" (phase 5 users design 1.2 item 3, D4), worst first on the Users page:
// the administrators (the built-in admin account always among them, 0.8), who may sign in over SSH,
// and, only when any person is in a system group that gives control of the NAS (0.5), one line per
// such person with the warning shape. Every name is a router link to the person's page; each list
// follows 0.2's five-names rule. The SSH line is a fact about the accounts (0.3); when SSH's own
// settings could not be read it says so. Nothing here is a status: no pill, no colour (D3).
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import type { ControlSummary } from "../../users/usersList.ts";
import { PersonLink } from "../atoms/PersonLink.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { PersonNameList } from "../molecules/PersonNameList.tsx";

export function UsersControlCard({
  summary,
  sshUnread,
  firstLineOnly = false,
}: {
  summary: ControlSummary;
  /** SSH.get failed: the SSH line names the accounts only and says SSH could not be checked. */
  sshUnread: boolean;
  /** Nobody is listed (1.4's empty state): only the first line. */
  firstLineOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.control.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          {summary.admins.length === 0 ? (
            t("users.control.adminOnly")
          ) : (
            <Slotted
              sentence={(tokens) => t("users.control.admins", tokens)}
              values={{ list: <PersonNameList names={summary.admins} /> }}
            />
          )}
        </p>
        {firstLineOnly ? null : (
          <>
            <p>
              {summary.ssh.length === 0 ? (
                t("users.control.sshNobody")
              ) : (
                <Slotted
                  sentence={(tokens) => t("users.control.ssh", tokens)}
                  values={{ list: <PersonNameList names={summary.ssh} /> }}
                />
              )}
              {sshUnread ? ` ${t("personCan.sshUnread")}` : null}
            </p>
            {summary.powers.map((p) => (
              <p key={p.name} className="flex items-start gap-2">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  <Trans
                    i18nKey="users.control.systemGroups"
                    values={{ groups: p.groups.map(isolateName).join(", ") }}
                    components={{ name: <PersonLink name={p.name} /> }}
                  />
                </span>
              </p>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
