// SPDX-License-Identifier: GPL-3.0-or-later
// Add a file system to a pool (phase 5 ZFS design 4.2): its name and how large it may grow, a summary
// without a typed field (nothing is erased), then the steps: check the pool and the name again, make it,
// set its limit, save its settings at a named checkpoint (R10) and check it is mounted. Refused, in
// place of the form, while the pool is Unknown, cannot be used or is full. Opening it only reads (R9);
// while anything is pending it does not start (R1). A normal user gets the "only administrators" page.
import {
  Button,
  EmptyState,
  JobRunner,
  JobSummary,
  RadioGroupField,
  RadioOption,
  SizeField,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useZfsPoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { addFsBlocker, fsNameProblem, quotaValue } from "../../zfs/zfsModel.ts";
import {
  startZfsFlow,
  zfsFlowStore,
  type AddFsChoices,
} from "../../zfs/zfsRun.ts";
import { zfsSession } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ZfsNameField } from "../molecules/ZfsNameField.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { ZfsRunView } from "../organisms/ZfsRunView.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { OtherZfsRun } from "./ZfsCreatePage.tsx";
import { ZfsCrumbs } from "./ZfsPoolPage.tsx";

export function ZfsFsAddRoutePage() {
  const { pool } = useParams({
    from: "/_signedIn/storage/zfs/pools/$pool/add",
  });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return <ZfsFsAdd address={pool} />;
}

function ZfsFsAdd({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const v = useZfsPoolView(address);
  const { run } = useMemoryStore(zfsFlowStore);
  const pending = pendingModules(info.data?.dirtyModules);
  const pool = v.view?.row.path ?? address ?? "";

  let content;
  if (v.missing) {
    content = <ZfsNotInstalled />;
  } else if (
    run !== null &&
    run.choices.kind === "addFs" &&
    run.choices.pool === pool
  ) {
    content = <ZfsRunView run={run} />;
  } else if (run !== null) {
    content = <OtherZfsRun run={run} />;
  } else if (address === null || (v.rows !== undefined && v.view === null)) {
    content = (
      <EmptyState
        action={
          <Link to="/storage/zfs" className={routerLinkClass}>
            {t("zfsPool.showAll")}
          </Link>
        }
      >
        {t("zfsPool.notFound")}
      </EmptyState>
    );
  } else if (v.list.isError) {
    content = (
      <ReadFailed error={v.list.error} onRetry={() => void v.list.refetch()}>
        {t("zfsPool.loadFailed")}
      </ReadFailed>
    );
  } else if (
    info.data === undefined ||
    v.view === null ||
    v.view.reportRead === "loading"
  ) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("zfsFsAdd.preflightBody")} />
    );
  } else {
    content = <AddDecisions address={pool} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ZfsCrumbs pool={address} current={t("zfsFsAdd.breadcrumb")} />
      <PageTitle documentTitle={t("zfsFsAdd.documentTitle", { pool })}>
        {t("zfsFsAdd.title", { pool })}
      </PageTitle>
      <JobRunner title={t("zfsFsAdd.runnerTitle")}>{content}</JobRunner>
    </div>
  );
}

function AddDecisions({ address }: { address: string }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  const v = useZfsPoolView(address);
  const memory = useMemoryStore(zfsSession);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [limited, setLimited] = useState(false);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"G" | "T">("G");
  const [problem, setProblem] = useState<"name" | "limit" | null>(null);
  const [fixed, setFixed] = useState<AddFsChoices | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fixed !== null) {
      summaryRef.current?.focus();
    }
  }, [fixed]);

  const view = v.view;
  if (view === null || v.rows === undefined) {
    return null;
  }
  const pool = view.row.path;
  const blocker = addFsBlocker(
    view.state,
    view.row.capacity,
    memory.changing.includes(pool),
  );
  if (blocker !== null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{t("zfsFsAdd.refused")}</p>
        <p className="max-w-prose">{words.blockerText(blocker)}</p>
        <p>
          <Link
            to="/storage/zfs/pools/$pool"
            params={{ pool }}
            className={routerLinkClass}
          >
            {t("zfsFsAdd.backToPool", { pool })}
          </Link>
        </p>
      </div>
    );
  }
  const nameProblem = fsNameProblem(name, v.rows, pool);
  const nameError =
    (touched || problem === "name") && nameProblem !== null
      ? t(`zfsName.fs.${nameProblem}`, { name, pool })
      : null;
  const limit = limited ? { amount, unit } : null;
  const limitError = problem === "limit" ? t("zfsFsAdd.limitInvalid") : null;
  const compression =
    view.root === undefined
      ? ""
      : words.compressionPlain(view.root.compression);

  if (fixed !== null) {
    const path = `${pool}/${fixed.name}`;
    const items = [
      <Trans
        key="make"
        i18nKey="zfsFsAdd.sum.make"
        values={{ pool, name: fixed.name }}
        components={{ fs: <IdentifierText value={path} /> }}
      />,
      ...(fixed.limit === null
        ? []
        : [
            t("zfsFsAdd.sum.limit", {
              limit: `${fixed.limit.amount} ${fixed.limit.unit === "G" ? t("format.gib") : t("format.tib")}`,
            }),
          ]),
      t("zfsFsAdd.sum.save"),
      t("zfsCreate.sum.sharing"),
    ];
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("zfsFsAdd.summaryTitle")}
          items={items}
          confirmLabel={t("zfsFsAdd.confirm")}
          backLabel={t("zfsCreate.changeChoices")}
          onBack={() => setFixed(null)}
          onConfirm={() =>
            startZfsFlow(
              fsApi,
              zfsApi,
              {
                erase: (device) => t("addStorage.task.erase", { device }),
                apply: t("pending.applyTask"),
              },
              fixed,
            )
          }
        />
      </div>
    );
  }

  const onContinue = () => {
    if (nameProblem !== null) {
      setTouched(true);
      setProblem("name");
      return;
    }
    if (limit !== null && quotaValue(limit) === null) {
      setProblem("limit");
      return;
    }
    setFixed({ kind: "addFs", pool, name, limit });
  };

  return (
    <div className="flex flex-col gap-5">
      <ZfsNameField
        label={t("zfsFsAdd.name")}
        value={name}
        onChange={(next) => {
          setName(next);
          setProblem(null);
        }}
        onBlur={() => setTouched(name !== "")}
        hint={t("zfsFsAdd.nameHint", { pool, name })}
        error={nameError}
      />
      <RadioGroupField
        legend={t("zfsFsAdd.limit")}
        hint={t("zfsFsAdd.limitHint")}
        value={limited ? "upTo" : "none"}
        onValueChange={(value) => {
          setLimited(value === "upTo");
          setProblem(null);
        }}
      >
        <RadioOption value="none" label={t("zfsFsAdd.limitNone")} />
        <RadioOption value="upTo" label={t("zfsFsAdd.limitUpTo")} />
      </RadioGroupField>
      {limited ? (
        <SizeField
          label={t("zfsFsAdd.limitAmount")}
          value={amount}
          onValueChange={(next) => {
            setAmount(next);
            setProblem(null);
          }}
          unit={unit}
          units={[
            { value: "G", label: t("format.gib") },
            { value: "T", label: t("format.tib") },
          ]}
          onUnitChange={(next) => setUnit(next === "T" ? "T" : "G")}
          unitLabel={t("zfsFsAdd.unit")}
          error={limitError ?? undefined}
        />
      ) : null}
      <p className="max-w-prose">
        {t("zfsFsAdd.compression", { compression })}
      </p>
      <p className="max-w-prose text-sm">{t("addStorage.sharingNext")}</p>
      <div>
        <Button onClick={onContinue}>{t("zfsCreate.continue")}</Button>
      </div>
    </div>
  );
}
