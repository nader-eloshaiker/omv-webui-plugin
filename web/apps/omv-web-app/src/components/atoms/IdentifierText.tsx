// SPDX-License-Identifier: GPL-3.0-or-later
// An identifier from the server placed in a translated sentence through a `<Trans>` slot (a host name,
// a time zone, a status code). The value is a prop, not children: `<Trans>` replaces a component's
// children with the slot's own (empty) content. Rendered as text, in the mono face (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";

export function IdentifierText({ value }: { value: string }) {
  return <Identifier>{value}</Identifier>;
}
