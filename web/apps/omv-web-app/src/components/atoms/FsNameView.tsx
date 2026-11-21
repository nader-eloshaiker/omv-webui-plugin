// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's name (phase 5 file-systems design 0.1): its label as text in its own direction, else
// "EXT4 on /dev/sdb1" with the device in the mono face, breaking anywhere. Rendered as text (UI-2).
import { Identifier } from "@omv-webui/react-ui-components";
import { Trans } from "react-i18next";
import { fsTypeKey, type FsName } from "../../filesystems/fsModel.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { IdentifierText } from "./IdentifierText.tsx";

export function FsNameView({ name }: { name: FsName }) {
  const { typeWord } = useFsWords();
  if (name.kind === "label") {
    return (
      <span dir="auto" className="[overflow-wrap:anywhere]">
        {name.text}
      </span>
    );
  }
  return (
    <Trans
      i18nKey="fsName.onDevice"
      values={{ type: typeWord(name.type) }}
      components={{ device: <IdentifierText value={name.device} /> }}
    />
  );
}

/** A file-system type: its word, or the server's own word in the mono face when it has none. */
export function FsTypeView({ type }: { type: string }) {
  const { typeWord } = useFsWords();
  return fsTypeKey(type) === null ? (
    <Identifier>{type}</Identifier>
  ) : (
    <>{typeWord(type)}</>
  );
}
