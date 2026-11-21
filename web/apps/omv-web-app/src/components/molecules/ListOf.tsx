// SPDX-License-Identifier: GPL-3.0-or-later
// Items joined as the locale joins a list ("NFS, Rsync server and SSH"), each item its own node, so
// a sentence can name things and mark one of them. Server text stays text (UI-2).
import { Fragment, type ReactNode } from "react";

export function ListOf({
  items,
}: {
  items: readonly { key: string; text: string; after?: ReactNode }[];
}) {
  const format = new Intl.ListFormat(undefined, { type: "conjunction" });
  const parts = format.formatToParts(items.map((i) => i.key));
  let index = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "literal") {
          return <Fragment key={`l${String(i)}`}>{part.value}</Fragment>;
        }
        const item = items[index];
        index += 1;
        return item ? (
          <Fragment key={item.key}>
            <span dir="auto">{item.text}</span>
            {item.after}
          </Fragment>
        ) : null;
      })}
    </>
  );
}
