// SPDX-License-Identifier: GPL-3.0-or-later
// A person's or a group's name in a translated sentence, through a `<Trans>` slot (phase 5 users
// design 0.2): the account name as received, in the mono face, in its own direction and isolated from
// the sentence around it, never cut short, with its bidirectional controls shown as "�" so it cannot
// pass for another name (format/isolate.ts). The value is a prop, not children: `<Trans>` replaces a
// component's children with the slot's own (empty) content. Rendered as text (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";
import { inertBidi } from "../../format/isolate.ts";

export function PersonNameText({ value }: { value: string }) {
  return (
    <bdi dir="auto" className="break-words">
      <Identifier>{inertBidi(value)}</Identifier>
    </bdi>
  );
}
