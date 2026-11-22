// SPDX-License-Identifier: GPL-3.0-or-later
// A person's or group's name inside a sentence (phase 5 users design 0.2): as received, in the
// identifier face, isolated in its own direction, with bidirectional controls shown as "�" so a name
// cannot pass for another (format/isolate.ts). Text only (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";
import { inertBidi } from "../../format/isolate.ts";

export function GroupNameText({ value }: { value: string }) {
  return (
    <bdi dir="auto">
      <Identifier>{inertBidi(value)}</Identifier>
    </bdi>
  );
}
