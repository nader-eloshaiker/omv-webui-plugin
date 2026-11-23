// SPDX-License-Identifier: GPL-3.0-or-later
// Network > General, "Name of this NAS" (phase 5 network design 2; 0.5's first rows, 0.8, 0.9, P15,
// D13), for administrators: the name and the domain in one settings form, how other computers find
// the NAS now, and, while the values differ from the stored ones, what a new name changes for them
// (2.3). The name is sent in lower case. When the page was opened by the old name the change Moves
// this page: Save reads "Review the change…" and opens the change flow in place (1.4); otherwise it
// is an ordinary save to the band. The stored values are read again just before every save (R4), and
// the connection with them. A normal user who types the address gets the "only administrators" page,
// and nothing is called.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  ExternalLink,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  IsolatedIdentifier,
  ServerMessage,
  Skeleton,
  useToast,
  type NowAfterRow,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useNetworkPending } from "../../hooks/useInterfacesPageReads.ts";
import { useNetworkApi } from "../../hooks/useNetworkApi.ts";
import {
  useConnection,
  useGeneralSettings,
  useWebPortsSettings,
} from "../../hooks/useNetworkReads.ts";
import {
  useNetworkWords,
  useReviewButton,
} from "../../hooks/useNetworkWords.ts";
import { useNetworkWrites } from "../../hooks/useNetworkWrites.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { confirmationFor } from "../../network/changeFlow.ts";
import {
  openedByName,
  type Connection,
  type PageLocation,
} from "../../network/connection.ts";
import type { GeneralSettings } from "../../network/dto.ts";
import {
  checkDomain,
  checkHostname,
  foundAs,
  generalChanged,
  generalRequest,
  nameEffects,
  type DomainProblem,
  type NameEffect,
  type NameProblem,
} from "../../network/generalModel.ts";
import { classifyNameChange, type Impact } from "../../network/impact.ts";
import { networkSession } from "../../network/networkSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { NetworkConnectionLine } from "../molecules/NetworkConnectionLine.tsx";
import { NetworkImpactLine } from "../molecules/NetworkImpactLine.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import {
  NetworkChangeFlow,
  type NetworkChange,
} from "../organisms/NetworkChangeFlow.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function NetworkGeneralPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("netGeneral.title")} />;
  }
  return <General />;
}

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

function General() {
  const { t } = useTranslation();
  // The reader's values, or null while they are the stored ones (so a new read shows through, and a
  // read on window focus never replaces what is being typed: it is off while there is a draft).
  const [draft, setDraft] = useState<GeneralSettings | null>(null);
  const [change, setChange] = useState<NetworkChange | null>(null);
  const focus = draft === null && change === null;
  const general = useGeneralSettings({ focus });
  const { connection, location, refresh } = useConnection({ focus });
  const web = useWebPortsSettings({ focus });
  const pending = useNetworkPending();
  const memory = useMemoryStore(networkSession);

  let content: ReactNode;
  if (general.data === undefined && general.isError) {
    content = (
      <ReadFailed
        error={general.error}
        onRetry={() => void general.refetch()}
        retrying={general.isFetching}
      >
        {t("netGeneral.loadFailed")}
      </ReadFailed>
    );
  } else if (general.data === undefined) {
    content = (
      <Card className="flex max-w-xl flex-col gap-4 p-4">
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("netGeneral.loading")}
        </p>
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        ))}
      </Card>
    );
  } else if (change !== null) {
    content = (
      <NetworkChangeFlow
        change={change}
        onBack={() => setChange(null)}
        onCancel={() => {
          setChange(null);
          setDraft(null);
        }}
        onDone={() => {
          setChange(null);
          setDraft(null);
        }}
      />
    );
  } else {
    content = (
      <NameCard
        stored={general.data}
        draft={draft}
        onDraft={setDraft}
        connection={connection}
        location={location}
        refresh={refresh}
        https={web.data?.enablessl === true}
        pending={memory.nameSaved && pending.includes("hostname")}
        onReview={setChange}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("netGeneral.title")}</PageTitle>
      <p className="max-w-prose">{t("network.term.hostname")}</p>
      {change === null && openedByName(connection) !== null ? (
        <NetworkConnectionLine connection={connection} />
      ) : null}
      {content}
      <footer className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>
          <ExternalLink
            href={CLASSIC.networkGeneral}
            newTabLabel={t("app.newTab")}
          >
            {t("netGeneral.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </div>
  );
}

/** One line of "If you change it" (2.3), from generalModel's nameEffects. */
function NameEffectLine({ effect }: { effect: NameEffect }) {
  const { t } = useTranslation();
  switch (effect.code) {
    case "netGeneral.effect.smb":
      return (
        <Trans
          i18nKey="netGeneral.effect.smb"
          components={{
            unc: <Value value={effect.unc} />,
            smb: <Value value={effect.smb} />,
          }}
        />
      );
    case "netGeneral.effect.domain":
      return (
        <Trans
          i18nKey="netGeneral.effect.domain"
          components={{ fqdn: <Value value={effect.fqdn} /> }}
        />
      );
    case "netGeneral.effect.short":
      return (
        <Trans
          i18nKey="netGeneral.effect.short"
          components={{ short: <Value value={effect.short} /> }}
        />
      );
    case "netGeneral.effect.nfs":
    case "netGeneral.effect.bookmarks":
    case "netGeneral.effect.certificate":
    case "netGeneral.effect.router":
      return t(effect.code);
  }
}

/** The field a refusal from OMV names ("hostname: The value …"), if any. */
const fieldNamed = (message: string): "hostname" | "domainname" | null =>
  message.startsWith("hostname:")
    ? "hostname"
    : message.startsWith("domainname:")
      ? "domainname"
      : null;

function ProblemText({ problem }: { problem: NameProblem | DomainProblem }) {
  const { t } = useTranslation();
  switch (problem.code) {
    case "netGeneral.err.name":
      return t("netGeneral.err.name");
    case "netGeneral.err.domain":
      return t("netGeneral.err.domain");
    case "netGeneral.err.local":
      return t("netGeneral.err.local");
    case "netGeneral.err.reserved":
      return (
        <Trans
          i18nKey="netGeneral.err.reserved"
          components={{ value: <Value value={problem.value} /> }}
        />
      );
  }
}

/** The name card (2.2 item 4): one settings form (Phase 3's rules). */
function NameCard({
  stored,
  draft,
  onDraft,
  connection,
  location,
  refresh,
  https,
  pending,
  onReview,
}: {
  stored: GeneralSettings;
  draft: GeneralSettings | null;
  onDraft: (draft: GeneralSettings | null) => void;
  connection: Connection;
  location: PageLocation;
  refresh: ReturnType<typeof useConnection>["refresh"];
  /** WebGui.getSettings has HTTPS on (2.3's certificate line). */
  https: boolean;
  /** This session saved the name and it is not applied yet. */
  pending: boolean;
  onReview: (change: NetworkChange) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const api = useNetworkApi();
  const writes = useNetworkWrites();
  const words = useNetworkWords();
  const headingId = useId();
  const noChangesId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const domainRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [checked, setChecked] = useState({
    hostname: false,
    domainname: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const value = draft ?? stored;
  const changed = generalChanged(stored, value);
  const dirty = changed.hostname || changed.domainname;
  const nameProblem = checkHostname(value.hostname);
  const domainProblem = checkDomain(value.domainname);
  const valid = nameProblem === null && domainProblem === null;
  const impact: Impact | null =
    dirty && valid ? classifyNameChange(connection, stored, value) : null;
  const review = useReviewButton(impact);
  const serverMessage = isRpcError(error) ? error.message : null;
  const serverField = serverMessage === null ? null : fieldNamed(serverMessage);
  const effects = dirty ? nameEffects(stored, value, https) : [];
  const now = foundAs(stored);

  const edit = (next: Partial<GeneralSettings>) => {
    setError(null);
    onDraft({ ...value, ...next });
  };
  const focusField = (field: "hostname" | "domainname") =>
    (field === "hostname" ? nameRef : domainRef).current?.focus();

  const save = async () => {
    if (saving) {
      return;
    }
    setChecked({ hostname: true, domainname: true });
    if (nameProblem !== null || domainProblem !== null) {
      focusField(nameProblem !== null ? "hostname" : "domainname");
      return;
    }
    if (!dirty) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Read, change, write (R4): the stored values and the connection, immediately before.
      const [before, reading] = await Promise.all([
        api.rereads.general(),
        refresh(),
      ]);
      const fresh = classifyNameChange(reading.connection, before, value);
      const request = generalRequest(value);
      if (fresh.class === "moves" || fresh.class === "mayCut") {
        onReview(nameChange(before, request, fresh));
        return;
      }
      await api.setGeneralSettings(request);
      onDraft(null);
      setChecked({ hostname: false, domainname: false });
      toast.show({ title: t("netGeneral.saved") });
      saveRef.current?.focus();
    } catch (failure) {
      setError(failure);
      const field = isRpcError(failure) ? fieldNamed(failure.message) : null;
      if (field !== null) {
        focusField(field);
      }
    } finally {
      setSaving(false);
    }
  };

  /** The change the flow reviews and writes (1.4): the name, Moves this page. */
  const nameChange = (
    before: GeneralSettings,
    request: GeneralSettings,
    classified: Impact,
  ): NetworkChange => {
    const moved = classified.findings.find(
      (f) => f.class === "moves" && f.effect === "netChange.effect.newName",
    );
    const rows: NowAfterRow[] = [
      {
        id: "hostname",
        label: t("netGeneral.name"),
        now: before.hostname,
        after: request.hostname,
        changed: before.hostname !== request.hostname,
      },
      {
        id: "domainname",
        label: t("netGeneral.domain"),
        now: before.domainname,
        after: request.domainname,
        changed: before.domainname !== request.domainname,
      },
    ];
    return {
      object: { kind: "name" },
      action: "name",
      rows: rows.filter((r) => r.changed),
      impact: classified,
      others: nameEffects(before, request, https).map((effect, i) => ({
        id: `${effect.code}:${String(i)}`,
        text: <NameEffectLine effect={effect} />,
      })),
      note: words.nameNote(before),
      confirmation: confirmationFor({ kind: "name" }, classified, {
        newHostname: request.hostname,
      }),
      write: writes.name({ before, request }),
      hostname: before.hostname,
      newName: moved?.class === "moves" ? moved.new : request.hostname,
    };
  };

  const fieldError = (
    field: "hostname" | "domainname",
    problem: NameProblem | DomainProblem | null,
  ): ReactNode =>
    checked[field] && problem !== null ? (
      <FieldError>
        <ProblemText problem={problem} />
      </FieldError>
    ) : serverField === field && serverMessage !== null ? (
      <FieldError>{serverMessage}</FieldError>
    ) : null;

  const nameError = fieldError("hostname", nameProblem);
  const domainError = fieldError("domainname", domainProblem);

  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex max-w-xl flex-col gap-4 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("netGeneral.title")}
        </h2>
        {pending ? <PendingMark /> : null}
      </div>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field invalid={nameError !== null ? true : undefined}>
          <FieldLabel>{t("netGeneral.name")}</FieldLabel>
          <FieldControl
            ref={nameRef}
            value={value.hostname}
            readOnly={saving}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="max-w-sm"
            onChange={(event) => edit({ hostname: event.target.value })}
            onBlur={() => setChecked((c) => ({ ...c, hostname: true }))}
          />
          <FieldHint>{t("netGeneral.nameHint")}</FieldHint>
          {nameError}
        </Field>
        <Field invalid={domainError !== null ? true : undefined}>
          <FieldLabel>{t("netGeneral.domain")}</FieldLabel>
          <FieldControl
            ref={domainRef}
            value={value.domainname}
            readOnly={saving}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="max-w-sm"
            onChange={(event) => edit({ domainname: event.target.value })}
            onBlur={() => setChecked((c) => ({ ...c, domainname: true }))}
          />
          <FieldHint>
            {t("network.term.domain", { host: now.host })}{" "}
            {t("netGeneral.domainHint")}
          </FieldHint>
          {domainError}
        </Field>
        <FoundAs stored={stored} />
        {effects.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">
              {t("netGeneral.ifChanged")}
            </h3>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
              {effects.map((effect, i) => (
                <li key={`${effect.code}:${String(i)}`}>
                  <NameEffectLine effect={effect} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ButtonsRow
          saveRef={saveRef}
          saving={saving}
          dirty={dirty}
          refused={review.refused}
          label={review.label}
          describedBy={
            !dirty
              ? noChangesId
              : review.opensFlow
                ? review.impactLineId
                : undefined
          }
          noChangesId={noChangesId}
          onDiscard={() => {
            onDraft(null);
            setError(null);
            setChecked({ hostname: false, domainname: false });
          }}
        />
        {impact !== null && review.opensFlow ? (
          <NetworkImpactLine
            id={review.impactLineId}
            impact={impact}
            location={location}
          />
        ) : null}
        {serverMessage !== null && serverField === null ? (
          <InlineAlert tone="critical" title={t("netGeneral.saveFailed")}>
            <ServerMessage label={t("app.serverMessage")}>
              {serverMessage}
            </ServerMessage>
          </InlineAlert>
        ) : null}
      </form>
      <LeaveGuard when={dirty && !saving} />
    </Card>
  );
}

function ButtonsRow({
  saveRef,
  saving,
  dirty,
  refused,
  label,
  describedBy,
  noChangesId,
  onDiscard,
}: {
  saveRef: RefObject<HTMLButtonElement | null>;
  saving: boolean;
  dirty: boolean;
  refused: boolean;
  label: string;
  describedBy: string | undefined;
  noChangesId: string;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        ref={saveRef}
        type="submit"
        variant={dirty ? "primary" : "neutral"}
        loading={saving}
        disabled={!dirty || refused}
        focusableWhenDisabled
        aria-describedby={describedBy}
      >
        {saving ? t("netGeneral.saving") : label}
      </Button>
      <Button
        type="button"
        variant="neutral"
        disabled={!dirty || saving}
        focusableWhenDisabled
        aria-describedby={dirty ? undefined : noChangesId}
        onClick={onDiscard}
      >
        {t("netGeneral.discard")}
      </Button>
      {dirty ? null : (
        <span id={noChangesId} className="text-sm text-muted-foreground">
          {t("common.noChanges")}
        </span>
      )}
    </div>
  );
}

/** How other computers find the NAS now (2.2 item 4), from the stored values, as text. */
function FoundAs({ stored }: { stored: GeneralSettings }) {
  const found = foundAs(stored);
  return (
    <p className="text-sm text-muted-foreground">
      <Trans
        i18nKey="netGeneral.foundAs"
        components={{
          host: <Value value={found.host} />,
          local: <Value value={found.local} />,
          unc: <Value value={found.unc} />,
        }}
      />
      {found.fqdn === null ? null : (
        <>
          {" "}
          <Trans
            i18nKey="netGeneral.foundAsDomain"
            components={{ fqdn: <Value value={found.fqdn} /> }}
          />
        </>
      )}
    </p>
  );
}
