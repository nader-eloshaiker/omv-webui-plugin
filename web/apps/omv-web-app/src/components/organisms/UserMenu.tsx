// SPDX-License-Identifier: GPL-3.0-or-later
// The user menu: who is signed in, the appearance preference (UI-13: a preference only), the classic
// interface at its fixed address, About, and Sign out.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink as ExternalIcon, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CLASSIC_HOME } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useSignOut } from "../../session/useSignOut.ts";
import { askShowAround } from "../../shell/showAround.ts";
import {
  isThemePreference,
  THEME_PREFERENCES,
  useThemeStore,
} from "../../stores/useThemeStore.ts";
import { AboutDialog } from "./AboutDialog.tsx";

export function UserMenu({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  const navigate = useNavigate();
  // "Show me around" replays the dashboard's first visit, which only an administrator's has.
  const admin = session.status === "signedIn" && session.role === "admin";
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const { signOut, failure } = useSignOut();
  const [about, setAbout] = useState(false);
  const [failureShown, setFailureShown] = useState(false);

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <IconButton
              label={
                username === null
                  ? t("user.menuNoName")
                  : t("user.menu", { name: username })
              }
              icon={<UserRound />}
              variant="plain"
            />
          }
        />
        <MenuContent align="end">
          <MenuGroup>
            <MenuGroupLabel>
              {username === null
                ? t("user.signedIn")
                : t("user.signedInAs", { name: username })}
            </MenuGroupLabel>
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <MenuGroupLabel>{t("theme.label")}</MenuGroupLabel>
            <MenuRadioGroup
              value={preference}
              onValueChange={(value: unknown) => {
                if (isThemePreference(value)) {
                  setPreference(value);
                }
              }}
            >
              {THEME_PREFERENCES.map((value) => (
                <MenuRadioItem key={value} value={value}>
                  {t(`theme.${value}`)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
          <MenuSeparator />
          {admin ? (
            <MenuItem
              onClick={() => {
                // Asked first, so the dashboard plays it whether it is on screen or about to be.
                askShowAround();
                void navigate({ to: "/" });
              }}
            >
              {t("dashboard.facts.showAround")}
            </MenuItem>
          ) : null}
          <MenuLinkItem
            href={CLASSIC_HOME}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("user.classic")}
            <ExternalIcon aria-hidden="true" />
            <span className="sr-only">{t("app.newTab")}</span>
          </MenuLinkItem>
          <MenuItem onClick={() => setAbout(true)}>{t("user.about")}</MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              setFailureShown(true);
              void signOut();
            }}
          >
            {t("user.signOut")}
          </MenuItem>
        </MenuContent>
      </Menu>
      <AboutDialog open={about} onOpenChange={setAbout} />
      <Dialog
        open={failure !== null && failureShown}
        onOpenChange={(open) => !open && setFailureShown(false)}
      >
        <DialogContent role="alertdialog">
          <DialogHeader>
            <DialogTitle>{t("signOut.failedTitle")}</DialogTitle>
          </DialogHeader>
          <p>{t("signOut.failedBody")}</p>
          {failure?.message ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="neutral" />}>
              {t("tasks.close")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
