// SPDX-License-Identifier: GPL-3.0-or-later
// "What to do now" on a person's page (phase 5 users design 2.4): one card, for the first case that
// applies: they are in a system group that gives control of the NAS; they may sign in over SSH but it
// cannot work (0.3's rows 3 to 6); they can open no shared folder at all; their home folder's shared
// folder cannot be reached. Each says what to do, with its link or the button that moves focus to the
// shared folders' grid. Words only, no colour (D3).
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ExternalLink,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import type { PersonTodo } from "../../users/personPage.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";

export function PersonTodoCard({
  todo,
  name,
  onChooseFolders,
}: {
  todo: PersonTodo;
  name: string;
  /** "Choose shared folders": focus moves to the grid's heading. */
  onChooseFolders: () => void;
}) {
  const { t } = useTranslation();
  const slot = { name: <PersonNameText value={name} /> };
  const shown = isolateName(name);
  let title: string;
  let body: ReactNode;
  switch (todo.kind) {
    case "power":
      title = t("person.todo.power.title", { name: shown });
      body = (
        <p>
          <Trans
            i18nKey="person.todo.power.body"
            values={{ groups: todo.groups.map(isolateName).join(", ") }}
            components={slot}
          />{" "}
          <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
            {t("users.classicLink")}
          </ExternalLink>
        </p>
      );
      break;
    case "ssh": {
      title = t("person.todo.ssh.title", { name: shown });
      const reading = todo.reading.kind;
      body = (
        <p>
          {reading === "noLoginShell" ? (
            t("person.ssh.noLoginShell")
          ) : reading === "sshOff" ? (
            <>
              {t("person.ssh.sshOff")}{" "}
              <Link to="/services/ssh" className={routerLinkClass}>
                {t("personCan.sshOffLink")}
              </Link>
            </>
          ) : reading === "notRunning" ? (
            <>
              {t("person.ssh.notRunning")}{" "}
              <Link to="/diagnostics/services/ssh" className={routerLinkClass}>
                {t("person.ssh.notRunningLink")}
              </Link>
            </>
          ) : (
            <Trans i18nKey="person.ssh.keysOnly" components={slot} />
          )}
        </p>
      );
      break;
    }
    case "noAccess":
      title = t("person.todo.noAccess.title", { name: shown });
      body = (
        <div className="flex flex-col items-start gap-2">
          <p>
            <Trans i18nKey="person.todo.noAccess.body" components={slot} />
          </p>
          <Button variant="neutral" size="sm" onClick={onChooseFolders}>
            {t("person.todo.noAccess.action")}
          </Button>
        </div>
      );
      break;
    case "home": {
      const { folder, state } = todo.state;
      title = t("person.todo.home.title", { name: shown });
      const reason =
        state.pill === "unknown"
          ? t("person.todo.home.unknown", { code: state.code })
          : state.pill === "critical"
            ? state.reason === "fsNotMounted" || state.reason === "fsMissing"
              ? t(`person.todo.home.${state.reason}`)
              : t(`sharedFolders.reason.${state.reason}`)
            : "";
      body = (
        <div className="flex flex-col items-start gap-2">
          <p>
            <Trans
              i18nKey="person.todo.home.body"
              values={{ reason }}
              components={{ folder: <FolderNameText value={folder.name} /> }}
            />
          </p>
          {isFolderAddress(folder.uuid) ? (
            <Link
              to="/storage/shared-folders/$folder"
              params={{ folder: folder.uuid }}
              className={routerLinkClass}
            >
              {t("person.todo.home.open", { folder: inertBidi(folder.name) })}
            </Link>
          ) : null}
        </div>
      );
      break;
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle level={3}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{body}</CardContent>
    </Card>
  );
}
