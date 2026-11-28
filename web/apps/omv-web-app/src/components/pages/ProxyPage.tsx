// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Proxy (phase 5 network design 12), for administrators: whether the NAS uses a proxy to
// reach the internet, for the web, the secure web and file transfer. Read on opening and on window
// focus (not while the form holds unsaved work); every stored password is replaced by whether it is
// set before anything sees the reply (the transport, UI-6). A normal user who types the address gets
// the "only administrators" page, and nothing is called.
import {
  Card,
  ExternalLink,
  Page,
  PageHeader,
  PageSection,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProxySettings } from "../../hooks/useNetworkReads.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { networkSession } from "../../network/networkSession.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ProxyForm } from "../organisms/ProxyForm.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function ProxyPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("proxy.title")} />;
  }
  return <Proxy />;
}

function Proxy() {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  const proxy = useProxySettings({ focus: !dirty });
  const info = useSystemInformation();
  const memory = useMemoryStore(networkSession);
  const modules = pendingModules(info.data?.dirtyModules);
  const pending =
    memory.proxySaved &&
    (modules.includes("apt") || modules.includes("profile"));

  let content;
  if (proxy.data === undefined && proxy.isError) {
    content = (
      <ReadFailed
        error={proxy.error}
        onRetry={() => void proxy.refetch()}
        retrying={proxy.isFetching}
      >
        {t("proxy.loadFailed")}
      </ReadFailed>
    );
  } else if (proxy.data === undefined) {
    content = (
      <div aria-busy="true" className="flex max-w-[40rem] flex-col gap-5">
        <p role="status" className="sr-only">
          {t("proxy.loading")}
        </p>
        {[0, 1, 2].map((i) => (
          <Card key={i} aria-hidden="true" className="flex flex-col gap-3 p-4">
            <Skeleton className="w-40" />
            <Skeleton className="h-5 w-56" />
            <Skeleton shape="block" className="h-8 w-full" />
            <Skeleton shape="block" className="h-8 w-24" />
          </Card>
        ))}
      </div>
    );
  } else {
    content = <ProxyForm saved={proxy.data} onDirtyChange={setDirty} />;
  }

  return (
    <Page>
      <PageHeader
        title={<PageTitle>{t("proxy.title")}</PageTitle>}
        besideTitle={pending ? <PendingMark /> : undefined}
      >
        <p className="max-w-prose">
          {t("network.term.proxy")} {t("proxy.uses")}
        </p>
      </PageHeader>
      <PageSection>{content}</PageSection>
      <footer className="text-sm text-muted-foreground">
        <ExternalLink href={CLASSIC.proxy} newTabLabel={t("app.newTab")}>
          {t("proxy.classicLink")}
        </ExternalLink>
      </footer>
    </Page>
  );
}
