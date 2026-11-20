// SPDX-License-Identifier: GPL-3.0-or-later
// Pending configuration modules in plain words: "SSH, Network discovery (Zeroconf)". An id this
// interface does not know (a plugin's) is shown as itself, in the mono face (UI-2: as text).
import { Identifier } from "@omv-webui/react-ui-components";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { isKnownModule } from "../../pending/modules.ts";

export function ModuleName({ id }: { id: string }) {
  const { t } = useTranslation();
  return isKnownModule(id) ? t(`modules.${id}`) : <Identifier>{id}</Identifier>;
}

export function ModuleNames({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 ? ", " : null}
          <ModuleName id={id} />
        </Fragment>
      ))}
    </>
  );
}
