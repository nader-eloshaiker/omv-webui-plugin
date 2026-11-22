// SPDX-License-Identifier: GPL-3.0-or-later
// UI-6 checks for the users pages' tests: whether a typed password is anywhere in the page's markup
// (text or an attribute), in the address, or in anything written to browser storage. Storage is
// watched at the Storage prototype, so a write by any code is seen without the test reading storage.
import { vi } from "vitest";

/** The page's whole markup, attributes included. */
export const markupOf = (): string =>
  new XMLSerializer().serializeToString(document.body);

/** Start watching storage writes; `wrote(text)` says whether any write carried the text. */
export function watchStorage() {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  return {
    wrote: (text: string): boolean =>
      setItem.mock.calls.some((args) =>
        args.some((a) => String(a).includes(text)),
      ),
  };
}
