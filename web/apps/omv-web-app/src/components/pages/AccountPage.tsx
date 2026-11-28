// SPDX-License-Identifier: GPL-3.0-or-later
// Your account (phase 3 design 5), for every signed-in user: who am I signed in as, and how do I
// change my password? Details are editable only by a normal user whose account is not locked; the
// password form is offered to every account and replaced by a note when the account is locked
// (`_readonly`; the backend does not check it for a password change, the interface honours it anyway).
// Reached at /account/settings and at /account/password, which moves focus to "Change password".
import type { Role } from "@omv-webui/react-api-omv/generated";
import { useUserMgmtGetUserByContext } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  ExternalLink,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  InlineAlert,
  Page,
  PageHeader,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useRouterState } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { detailsEditable, type DetailsValues } from "../../account/account.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { SshKeyList } from "../molecules/SshKeyList.tsx";
import { AccountDetailsForm } from "../organisms/AccountDetailsForm.tsx";
import { PasswordForm } from "../organisms/PasswordForm.tsx";

export function AccountPage({ focus }: { focus: "top" | "password" }) {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return <Account role={session.role} focus={focus} />;
}

/**
 * A section of the page, as `PageSection` lays one out, with the heading's id and focus kept here:
 * the forms are named by the heading, and "Change password" takes focus on arrival.
 */
function Section({
  id,
  title,
  headingRef,
  children,
}: {
  id: string;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-group">
      <h2
        id={id}
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="text-section text-foreground outline-hidden"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Account({ role, focus }: { role: Role; focus: "top" | "password" }) {
  const { t } = useTranslation();
  const account = useUserMgmtGetUserByContext();
  const detailsId = useId();
  const passwordId = useId();
  const keysId = useId();
  const passwordHeadingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<DetailsValues | null>(null);
  const [passwordTyped, setPasswordTyped] = useState(false);
  const data = account.data;

  // Arriving at /account/password: focus goes to "Change password", announced, and the next Tab
  // reaches the new password. Once, when the section first appears and the router has settled on the
  // address (the page title takes focus after each navigation; this runs after it).
  // Keyed on one flag that turns true once, so a refetch never moves focus again.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const arrivedAtPassword =
    focus === "password" &&
    pathname === "/account/password" &&
    data !== undefined;
  useEffect(() => {
    if (arrivedAtPassword) {
      passwordHeadingRef.current?.focus();
    }
  }, [arrivedAtPassword]);

  const title = <PageTitle>{t("account.title")}</PageTitle>;

  if (data === undefined && account.isError) {
    return (
      <Page className="max-w-3xl">
        <PageHeader title={title}>
          <EmptyState
            variant="error"
            serverMessage={
              isRpcError(account.error)
                ? { label: t("app.serverMessage"), text: account.error.message }
                : undefined
            }
            action={
              <Button variant="neutral" onClick={() => void account.refetch()}>
                {t("common.tryAgain")}
              </Button>
            }
          >
            {t("account.loadFailed")}
          </EmptyState>
        </PageHeader>
      </Page>
    );
  }

  if (data === undefined) {
    return (
      <Page className="max-w-3xl" aria-busy="true">
        <PageHeader title={title}>
          <p role="status" className="sr-only">
            {t("account.loading")}
          </p>
        </PageHeader>
        <Section id={detailsId} title={t("account.details")}>
          <FactListSkeleton rows={3} />
        </Section>
        <Section id={passwordId} title={t("account.password")}>
          <Skeleton className="w-2/3" />
        </Section>
        <Section id={keysId} title={t("account.keys")}>
          <Skeleton className="w-1/2" />
        </Section>
      </Page>
    );
  }

  const admin = role === "admin";
  const locked = data._readonly;
  const editable = detailsEditable(role, locked);
  const saved = { email: data.email, comment: data.comment };
  const detailsDirty =
    draft !== null &&
    (draft.email !== saved.email || draft.comment !== saved.comment);

  const lockedNote = (
    <InlineAlert tone="neutral" role="note">
      {t("account.lockedNote")}
    </InlineAlert>
  );

  return (
    <Page className="max-w-3xl">
      <LeaveGuard when={detailsDirty || passwordTyped} />
      <PageHeader
        title={title}
        subtitle={
          <Trans
            i18nKey="account.signedInAs"
            components={{ name: <IdentifierText value={data.name} /> }}
          />
        }
      />

      <Section id={detailsId} title={t("account.details")}>
        {editable ? (
          <>
            <FactList>
              <FactListItem>
                <FactListLabel>{t("account.name")}</FactListLabel>
                <FactListValue variant="identifier">{data.name}</FactListValue>
              </FactListItem>
            </FactList>
            <AccountDetailsForm
              saved={saved}
              draft={draft}
              onDraftChange={setDraft}
              labelledBy={detailsId}
            />
          </>
        ) : (
          <>
            <FactList>
              <FactListItem>
                <FactListLabel>{t("account.name")}</FactListLabel>
                <FactListValue variant="identifier">{data.name}</FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("account.comment")}</FactListLabel>
                {data.comment === "" ? (
                  <FactListValue variant="missing">
                    {t("common.none")}
                  </FactListValue>
                ) : (
                  <FactListValue>{data.comment}</FactListValue>
                )}
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("account.email")}</FactListLabel>
                {data.email === "" ? (
                  <FactListValue variant="missing">
                    {t("common.none")}
                  </FactListValue>
                ) : (
                  <FactListValue>{data.email}</FactListValue>
                )}
              </FactListItem>
            </FactList>
            {admin ? (
              <InlineAlert tone="neutral" role="note">
                <p>{t("account.adminNote")}</p>
                <p>
                  <ExternalLink
                    href={CLASSIC.notifications}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("account.adminNoteLink")}
                  </ExternalLink>
                </p>
              </InlineAlert>
            ) : (
              lockedNote
            )}
          </>
        )}
      </Section>

      <Section
        id={passwordId}
        title={t("account.password")}
        headingRef={passwordHeadingRef}
      >
        {locked ? (
          lockedNote
        ) : (
          <PasswordForm
            username={data.name}
            role={role}
            onTypedChange={setPasswordTyped}
            labelledBy={passwordId}
          />
        )}
      </Section>

      <Section id={keysId} title={t("account.keys")}>
        <SshKeyList keys={data.sshpubkeys} admin={admin} />
      </Section>
    </Page>
  );
}
