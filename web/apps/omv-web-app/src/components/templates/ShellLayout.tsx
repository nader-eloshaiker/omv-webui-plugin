// SPDX-License-Identifier: GPL-3.0-or-later
// The application shell (style guide 5.1), around every page behind sign-in. In order, and never
// side by side: the skip link, the top bar (the only sticky part), the unencrypted-connection notice
// (UI-12), the pending-changes band (5.8, administrators), then the side navigation and the content.
// Under 1024px the navigation is a drawer. The pages' toasts (5.10) are shown here. It renders nothing
// the moment the session is gone, so no read under it fetches again after the server data has been
// dropped.
import {
  IconButton,
  SideNav,
  SideNavDrawer,
  SkipLink,
  Toaster,
  TopBar,
} from "@omv-webui/react-ui-components";
import { Outlet } from "@tanstack/react-router";
import { Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveReads } from "../../live/useLive.ts";
import { useSession } from "../../session/sessionContext.ts";
import { MAIN_ID } from "../../shell/ids.ts";
import {
  PageFocusContext,
  useNavigationTracker,
} from "../../shell/pageFocus.ts";
import { ShowTaskContext } from "../../shell/taskDialog.ts";
import { HttpNotice } from "../organisms/HttpNotice.tsx";
import { IdleWarning } from "../organisms/IdleWarning.tsx";
import { MainNav } from "../organisms/MainNav.tsx";
import { PendingChanges } from "../organisms/PendingChanges.tsx";
import { PendingIndicator } from "../organisms/PendingIndicator.tsx";
import { TaskAnnouncer } from "../organisms/TaskAnnouncer.tsx";
import { TaskOutputDialog } from "../organisms/TaskOutputDialog.tsx";
import { TasksMenu } from "../organisms/TasksMenu.tsx";
import { UserMenu } from "../organisms/UserMenu.tsx";

export function ShellLayout() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return <Shell username={session.username} role={session.role} />;
}

function Shell({
  username,
  role,
}: {
  username: string | null;
  role: "admin" | "user";
}) {
  const { t } = useTranslation();
  // The one poll of System.getInformation and the interface counters (live/useLive.ts).
  const info = useLiveReads(role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shownTask, setShownTask] = useState<number | null>(null);
  const pageFocus = useNavigationTracker();
  const admin = role === "admin";

  return (
    <PageFocusContext value={pageFocus}>
      <ShowTaskContext value={setShownTask}>
        <div className="flex min-h-dvh flex-col bg-page">
          <SkipLink targetId={MAIN_ID}>{t("app.skipToMain")}</SkipLink>
          <TopBar
            className="sticky top-0 z-40"
            productName={t("app.name")}
            hostName={info.data?.hostname}
            navToggle={
              <IconButton
                label={t("app.openNav")}
                icon={<MenuIcon />}
                variant="onIdentity"
                onClick={() => setDrawerOpen(true)}
              />
            }
            pending={admin ? <PendingIndicator /> : undefined}
            tasks={<TasksMenu />}
            user={<UserMenu username={username} />}
          />
          <HttpNotice role={role} />
          {admin ? <PendingChanges /> : null}
          <div className="flex flex-1">
            <SideNav
              aria-label={t("app.navigation")}
              className="hidden w-64 shrink-0 border-e border-border lg:flex"
            >
              <MainNav role={role} />
            </SideNav>
            <SideNavDrawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              label={t("app.navigation")}
              closeLabel={t("app.closeNav")}
            >
              <MainNav role={role} onNavigate={() => setDrawerOpen(false)} />
            </SideNavDrawer>
            <main
              id={MAIN_ID}
              tabIndex={-1}
              className="min-w-0 flex-1 px-4 py-6 outline-hidden sm:px-6"
            >
              <Outlet />
            </main>
          </div>
          <IdleWarning />
          <TaskOutputDialog id={shownTask} onClose={() => setShownTask(null)} />
          <TaskAnnouncer />
          <Toaster
            closeLabel={t("toast.close")}
            regionLabel={t("toast.region")}
          />
        </div>
      </ShowTaskContext>
    </PageFocusContext>
  );
}
