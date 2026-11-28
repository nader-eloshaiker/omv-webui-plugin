// SPDX-License-Identifier: GPL-3.0-or-later
// "Warning level and tags" on a file system's page (phase 5 file-systems design 2.6): a settings form
// on the file system's mount entry. Save reads the entry again first (R4), then writes it back with
// every one of its own fields and only these two changed, so nothing else is ever overwritten; then the
// save-then-apply loop of the band. The entry is found by the stable path OMV stored, from the row.
import {
  getFileSystemMgmtGetListQueryKey,
  getFsTabGetByFsNameQueryOptions,
  useFsTabSet,
  type ConfiguredFilesystem,
  type MountEntry,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  PageSection,
  ServerMessage,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  splitTags,
  tagsToSave,
  tagsTooLong,
} from "../../filesystems/fsModel.ts";
import { recordSettingsSaved } from "../../filesystems/fsSession.ts";
import { useMountEntry } from "../../hooks/useFsReads.ts";
import { ALL_CONFIGURED } from "../../hooks/useMonitoringReads.ts";
import { LevelField, TagsField } from "../molecules/FsSettingFields.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

export function FsSettingsForm({
  fs,
  address,
}: {
  fs: ConfiguredFilesystem;
  /** The page's address, which the session's "saved" mark is kept by. */
  address: string;
}) {
  const { t } = useTranslation();
  const entry = useMountEntry(fs.devicefile);

  let body;
  if (entry.data === undefined && entry.isError) {
    body = (
      <ReadFailed
        error={entry.error}
        retrying={entry.isFetching}
        onRetry={() => void entry.refetch()}
      >
        {t("filesystem.settings.loadFailed")}
      </ReadFailed>
    );
  } else if (entry.data === undefined) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p role="status" className="sr-only">
          {t("app.loading")}
        </p>
        <Skeleton aria-hidden="true" className="h-8 w-56" />
        <Skeleton aria-hidden="true" className="h-8 w-80" />
      </div>
    );
  } else if (entry.data === false) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p>{t("filesystem.settings.noEntry")}</p>
        <Button
          variant="neutral"
          loading={entry.isFetching}
          onClick={() => void entry.refetch()}
        >
          {t("filesystem.refresh")}
        </Button>
      </div>
    );
  } else {
    body = <Form fs={fs} saved={entry.data} address={address} />;
  }

  return (
    <PageSection heading={t("filesystem.settings.title")}>{body}</PageSection>
  );
}

interface Draft {
  level: number;
  tags: string;
}

const draftOf = (entry: MountEntry): Draft => ({
  level: entry.usagewarnthreshold,
  tags: splitTags(entry.comment).join(", "),
});

function Form({
  fs,
  saved,
  address,
}: {
  fs: ConfiguredFilesystem;
  saved: MountEntry;
  address: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const set = useFsTabSet();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [problem, setProblem] = useState<
    { kind: "removed" } | { kind: "failed"; error: unknown } | null
  >(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const noChangesId = useId();

  const values = draft ?? draftOf(saved);
  const dirty =
    draft !== null &&
    (draft.level !== saved.usagewarnthreshold ||
      tagsToSave(draft.tags) !== tagsToSave(saved.comment));
  const saving = rereading || set.isPending;

  useEffect(() => {
    if (problem !== null) {
      alertRef.current?.focus();
    }
  }, [problem]);

  const edit = (change: Partial<Draft>) => {
    setDraft({ ...values, ...change });
    setSavedNotice(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving || draft === null) {
      return;
    }
    if (tagsTooLong(draft.tags)) {
      setTooLong(true);
      tagsRef.current?.focus();
      return;
    }
    setProblem(null);
    setRereading(true);
    const options = getFsTabGetByFsNameQueryOptions({ fsname: fs.devicefile });
    let fresh: MountEntry | false;
    try {
      // R4: the entry as it is now, so another tab's change to any other field is kept.
      // Its own key: a re-read that finds no entry must not replace the form under the reader.
      fresh = await queryClient.fetchQuery({
        ...options,
        queryKey: [
          ...options.queryKey,
          "beforeSave",
        ] as unknown as typeof options.queryKey,
        staleTime: 0,
        gcTime: 0,
        retry: false,
      });
    } catch (error) {
      setRereading(false);
      setProblem({ kind: "failed", error });
      return;
    }
    setRereading(false);
    if (fresh === false) {
      setProblem({ kind: "removed" });
      return;
    }
    set.mutate(
      {
        data: {
          uuid: fresh.uuid,
          fsname: fresh.fsname,
          dir: fresh.dir,
          type: fresh.type,
          opts: fresh.opts,
          freq: fresh.freq,
          passno: fresh.passno,
          hidden: fresh.hidden,
          usagewarnthreshold: draft.level,
          comment: tagsToSave(draft.tags),
        },
      },
      {
        onSuccess: (stored) => {
          queryClient.setQueryData(options.queryKey, stored);
          void queryClient.invalidateQueries({
            queryKey: getFileSystemMgmtGetListQueryKey(ALL_CONFIGURED),
          });
          recordSettingsSaved(address);
          setDraft(null);
          setSavedNotice(true);
          saveRef.current?.focus();
        },
        onError: (error) => setProblem({ kind: "failed", error }),
      },
    );
  };

  const discard = () => {
    setDraft(null);
    setTooLong(false);
    setProblem(null);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-label={t("filesystem.settings.title")}
      className="flex max-w-[40rem] flex-col gap-4"
    >
      <LeaveGuard when={dirty} />
      {problem !== null ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={
            problem.kind === "removed"
              ? t("filesystem.settings.removedMeanwhile")
              : t("filesystem.settings.saveFailed")
          }
          className="outline-hidden"
        >
          {problem.kind === "failed" && isRpcError(problem.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {problem.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <LevelField
        value={values.level}
        saved={saved.usagewarnthreshold}
        onChange={(level) => edit({ level })}
        readOnly={saving}
      />
      <TagsField
        value={values.tags}
        onChange={(tags) => {
          edit({ tags });
          setTooLong(false);
        }}
        readOnly={saving}
        tooLong={tooLong}
        inputRef={tagsRef}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={saveRef}
            type="submit"
            variant={dirty ? "primary" : "neutral"}
            loading={saving}
            disabled={!dirty}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={!dirty || saving}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
            onClick={discard}
          >
            {t("common.discard")}
          </Button>
          {dirty ? null : (
            <span id={noChangesId} className="text-sm text-muted-foreground">
              {t("common.noChanges")}
            </span>
          )}
        </div>
        <p role="status" className="text-sm text-foreground empty:hidden">
          {savedNotice ? t("common.savedPending") : ""}
        </p>
      </div>
    </form>
  );
}
