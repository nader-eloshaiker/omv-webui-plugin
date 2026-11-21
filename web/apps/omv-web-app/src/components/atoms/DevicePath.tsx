// SPDX-License-Identifier: GPL-3.0-or-later
// A long device path from the server (a stable /dev/disk/by-id/… name) in the mono face, allowed to
// break after its separators (/, - and _) rather than anywhere, so a narrow column shows whole words
// instead of one character per line. Rendered as text (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";

export function DevicePath({ value }: { value: string }) {
  const pieces = value.split(/(?<=[/_-])/);
  let at = 0;
  return (
    <Identifier className="[overflow-wrap:normal] break-normal">
      {pieces.map((piece) => {
        const key = at;
        at += piece.length;
        return (
          <span key={key}>
            {piece}
            <wbr />
          </span>
        );
      })}
    </Identifier>
  );
}
