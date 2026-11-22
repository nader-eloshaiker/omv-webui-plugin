// SPDX-License-Identifier: GPL-3.0-or-later
// The line under "Turn on SSH" (phase 5 users design 13.2): who may sign in over SSH, from
// UserMgmt.getUserList (0.3's account part only: in `_ssh` or `root`), at most five names then "and
// {{count}} more" (0.2), or that nobody may yet. Said nothing while the list is read or when it
// failed: the form does not rest on it. Names are text (UI-2).
import { useTranslation } from "react-i18next";
import { inertBidi, isolate } from "../../format/isolate.ts";
import { useUserAccounts } from "../../hooks/useSharesReads.ts";
import { sshPeople } from "../../ssh/sshPeople.ts";

export function SshPeopleLine() {
  const { t } = useTranslation();
  const users = useUserAccounts();
  if (users.data === undefined) {
    return null;
  }
  const { names, more } = sshPeople(users.data.data);
  if (names.length === 0) {
    return <p className="text-sm">{t("ssh.nobody")}</p>;
  }
  const shown = names.map((n) => isolate(inertBidi(n)));
  const list =
    more > 0
      ? `${shown.join(", ")} ${t("users.more", { count: more })}`
      : new Intl.ListFormat(undefined, { type: "conjunction" }).format(shown);
  return <p className="text-sm">{t("ssh.people", { list })}</p>;
}
