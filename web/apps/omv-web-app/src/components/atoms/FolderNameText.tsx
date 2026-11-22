// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's name in a translated sentence, through a `<Trans>` slot (phase 5 shares design
// 0.2): the name as text, medium weight, in its own direction and isolated from the sentence around
// it, never cut short, with its bidirectional controls shown as "�" so it cannot pass for another name
// (format/isolate.ts). The value is a prop, not children: `<Trans>` replaces a component's children
// with the slot's own (empty) content. Rendered as text (UI-2).
import { inertBidi } from "../../format/isolate.ts";

export function FolderNameText({ value }: { value: string }) {
  return (
    <bdi dir="auto" className="font-medium break-words">
      {inertBidi(value)}
    </bdi>
  );
}
