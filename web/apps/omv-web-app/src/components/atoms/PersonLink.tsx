// SPDX-License-Identifier: GPL-3.0-or-later
// A person's name as a router link to their page (phase 5 users design 1.3, 14.2), accessible name
// "Open {{name}}". The address is the listed name, checked against OMV's pattern first (UI-4). A
// person whose name is also the address of "Add a person" (`add`, which OMV takes) has no page here:
// the name is shown as text with the sentence that says why and the fixed link to the classic Users
// list; no address is ever built from the name for the classic interface (UI-3).
import { ExternalLink } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { hasOwnPage } from "../../users/nameRules.ts";

export function PersonLink({
  name,
  label,
  className,
  hash,
}: {
  name: string;
  /** The link's words, when not the name itself ("Open alex"); the name is then in them. */
  label?: string;
  className?: string;
  /** A section of the page to open at. */
  hash?: string;
}) {
  const { t } = useTranslation();
  if (!hasOwnPage(name)) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <bdi dir="auto" className="font-medium break-words">
          {inertBidi(name)}
        </bdi>
        <span className="text-sm text-muted-foreground">
          {t("users.addNameNoPage")}{" "}
          <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
            {t("users.classicLink")}
          </ExternalLink>
        </span>
      </span>
    );
  }
  return (
    <Link
      to="/usermgmt/users/$name"
      params={{ name }}
      hash={hash}
      aria-label={
        label === undefined
          ? t("users.open", { name: inertBidi(name) })
          : undefined
      }
      className={`${routerLinkClass} break-words ${className ?? ""}`}
    >
      {label ?? <bdi dir="auto">{inertBidi(name)}</bdi>}
    </Link>
  );
}
