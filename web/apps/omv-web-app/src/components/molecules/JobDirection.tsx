// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's direction (phase 5 services design 0.6, 18.2): the two sides with the arrow and the
// words "From" and "To", then 0.6's sentence, on the library's DirectionSummary. Every name is text
// (UI-2): a shared folder's name isolated with `dir="auto"`, another computer's folder and name in
// Identifier. The sentence is what a screen reader relies on; the arrow is decorative.
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { DirectionSummary } from "@omv-webui/react-ui-components";
import type { ComponentProps, ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import {
  copiesFolderItself,
  remoteWords,
  type JobSides,
  type Side,
} from "../../services/jobModel.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

/**
 * Our own words for a slot of a Trans sentence ("the destination"). A Trans slot replaces an
 * element's children with the slot's own, which are empty, so the text comes in as a prop.
 */
export function SlotText({ value }: { value: string }) {
  return <span>{value}</span>;
}

/** A side for a sentence or a table cell: the folder's name (linked when asked), or "path on host". */
export function JobSideView({
  side,
  folders,
  link = false,
  name,
}: {
  side: Side;
  folders: readonly SharedFolder[] | undefined;
  link?: boolean;
  /** The list row's own name for the side (Rsync.getList), used when the folder list has no row. */
  name?: string;
}) {
  const { t } = useTranslation();
  if (side.kind === "folder") {
    const folder = folders?.find((f) => f.uuid === side.uuid);
    if (folder === undefined) {
      return name !== undefined && name !== "" ? (
        <FolderNameText value={name} />
      ) : (
        <span>{t("job.folderGone")}</span>
      );
    }
    return link ? (
      <FolderLink uuid={folder.uuid} name={folder.name} />
    ) : (
      <FolderNameText value={folder.name} />
    );
  }
  const words = remoteWords(side.uri);
  if (words === null) {
    return <IdentifierText value={inertBidi(side.uri)} />;
  }
  return (
    <Trans
      i18nKey="jobs.remote"
      components={{
        path: <IdentifierText value={inertBidi(words.path)} />,
        host: <IdentifierText value={inertBidi(words.host)} />,
      }}
    />
  );
}

/** 0.6's sentence for the two sides. */
export function JobSentence({
  sides,
  folders,
}: {
  sides: JobSides;
  folders: readonly SharedFolder[] | undefined;
}) {
  const src = <JobSideView side={sides.from} folders={folders} />;
  const dest = <JobSideView side={sides.to} folders={folders} />;
  const remote = sides.direction === "push" ? sides.to : sides.from;
  const words = remote.kind === "remote" ? remoteWords(remote.uri) : null;
  const path = (
    <IdentifierText
      value={inertBidi(
        words?.path ?? (remote.kind === "remote" ? remote.uri : ""),
      )}
    />
  );
  const host = <IdentifierText value={inertBidi(words?.host ?? "")} />;
  if (copiesFolderItself(sides)) {
    return (
      <Trans
        i18nKey="job.sentence.folderItself"
        components={{ name: path, dest }}
      />
    );
  }
  return (
    <Trans
      i18nKey={`job.sentence.${sides.direction}`}
      components={{ src, dest, path, host }}
    />
  );
}

/** The sides on one line with the arrow, then the sentence. */
export function JobDirection({
  sides,
  folders,
  link = false,
  ...props
}: {
  sides: JobSides;
  folders: readonly SharedFolder[] | undefined;
  link?: boolean;
} & Omit<
  ComponentProps<typeof DirectionSummary>,
  "sentence" | "from" | "to"
>): ReactNode {
  const { t } = useTranslation();
  return (
    <DirectionSummary
      {...props}
      fromLabel={t("job.fromLabel")}
      toLabel={t("job.toLabel")}
      from={<JobSideView side={sides.from} folders={folders} link={link} />}
      to={<JobSideView side={sides.to} folders={folders} link={link} />}
      sentence={<JobSentence sides={sides} folders={folders} />}
    />
  );
}
