// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's name in a translated sentence, through a `<Trans>` slot (phase 5 shares design 0.2):
// its name rule's words, its bidirectional controls shown as "�", isolated from the sentence around it. The row is a prop, not children:
// `<Trans>` replaces a component's children with the slot's own (empty) content. Rendered as text.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { inertBidi } from "../../format/isolate.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { FsNameView } from "./FsNameView.tsx";

export function FsNameSlot({
  fs,
  fallback = "",
}: {
  fs: ConfiguredFilesystem | undefined;
  /** What to say when the file system is not known (its device as the folder's row names it). */
  fallback?: string;
}) {
  return (
    <bdi dir="auto" className="[overflow-wrap:anywhere]">
      {fs === undefined ? (
        inertBidi(fallback)
      ) : (
        <FsNameView name={shownFsName(fs)} />
      )}
    </bdi>
  );
}
