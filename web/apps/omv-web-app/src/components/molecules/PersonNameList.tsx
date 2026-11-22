// SPDX-License-Identifier: GPL-3.0-or-later
// Names in a sentence (phase 5 users design 0.2): at most five in natural order, then "and {{count}}
// more"; each a router link to the person's page (PersonLink, which shows a name with no page here as
// text), or plain names when `links` is off. Server text stays text (UI-2).
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { fewNames } from "../../users/usersList.ts";
import { PersonLink } from "../atoms/PersonLink.tsx";
import { ListOf } from "./ListOf.tsx";

export function PersonNameList({
  names,
  max = 5,
  links = true,
}: {
  names: readonly string[];
  max?: number;
  links?: boolean;
}) {
  const { t } = useTranslation();
  const { shown, more } = fewNames(names, max);
  const item = (name: string) =>
    links ? (
      <PersonLink name={name} />
    ) : (
      <bdi dir="auto" className="font-medium break-words">
        {inertBidi(name)}
      </bdi>
    );
  if (more === 0) {
    return (
      <ListOf
        items={shown.map((name) => ({
          key: name,
          text: name,
          content: item(name),
        }))}
      />
    );
  }
  return (
    <>
      {shown.map((name, i) => (
        <Fragment key={name}>
          {i > 0 ? ", " : null}
          {item(name)}
        </Fragment>
      ))}{" "}
      {t("users.more", { count: more })}
    </>
  );
}
