// SPDX-License-Identifier: GPL-3.0-or-later
// 13.1 of the users design: on a shared folder's access grid, the stale-entry line (entries for
// accounts no list shows) adds, for each account this session deleted, "{{name}} was deleted in this
// session." so the reader knows why the entry is stale. Read from the session store (usersSession);
// nothing is said about accounts this session did not delete.
import type { SharedFolderPrivilege } from "@omv-webui/react-api-omv/generated";
import { Trans } from "react-i18next";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deletedInSession, usersSession } from "../../users/usersSession.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";

export function UsersDeletedNote({
  entries,
}: {
  entries: readonly Pick<SharedFolderPrivilege, "type" | "name">[];
}) {
  const memory = useMemoryStore(usersSession);
  const deleted = entries.filter((e) =>
    deletedInSession(memory, e.type, e.name),
  );
  if (deleted.length === 0) {
    return null;
  }
  return (
    <>
      {deleted.map((e) => (
        <span key={`${e.type}:${e.name}`}>
          {" "}
          <Trans
            i18nKey="users.staleDeleted"
            components={{ name: <PersonNameText value={e.name} /> }}
          />
        </span>
      ))}
    </>
  );
}
