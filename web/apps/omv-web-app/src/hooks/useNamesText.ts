// SPDX-License-Identifier: GPL-3.0-or-later
// A list of names inside a sentence (phase 5 users design 0.2): at most so many, in the order given,
// joined as the locale joins a list, then "and {{count}} more"; each name isolated in its own
// direction with its bidirectional controls shown as "�" (format/isolate.ts).
import { useTranslation } from "react-i18next";
import { isolateName } from "../format/isolate.ts";
import { namesUpTo } from "../groups/groupsTable.ts";

/** "alex, robin and sam" / "alex, robin, sam and 3 more", each name isolated. */
export function useNamesText() {
  const { t } = useTranslation();
  return (names: readonly string[], max: number): string => {
    const { shown, more } = namesUpTo(names, max);
    const isolated = shown.map(isolateName);
    if (more === 0) {
      return new Intl.ListFormat(undefined, { type: "conjunction" }).format(
        isolated,
      );
    }
    return `${isolated.join(", ")} ${t("users.more", { count: more })}`;
  };
}
