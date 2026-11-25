// SPDX-License-Identifier: GPL-3.0-or-later
// The application shell (foundation 10; style guide 5.1), around every page behind sign-in. In order,
// and never side by side: the skip link, the top bar (sticky, solid, with a hairline under it), the
// unencrypted-connection notice (UI-12), the pending-changes band (5.8, administrators; it sticks
// under the top bar and shrinks into the bar's pending pill while scrolling), then the side
// navigation with folding groups and the content. Under 1024px the navigation is a drawer. The top bar
// carries the mark and host, "Go to or do…" (the command palette, `/` or Ctrl/Cmd+K), the density
// switch, the pending pill, the tasks and the account. The pages' toasts (5.10) are shown here. It
// renders nothing the moment the session is gone, so no read under it fetches again after the server
// data has been dropped.
import {
  CommandPaletteTrigger,
  DensityToggle,
  IconButton,
  Shell,
  SideNav,
  SideNavDrawer,
  SkipLink,
  Toaster,
  TopBar,
  TopBarBrand,
} from "@omv-webui/react-ui-components";
import { Link, Outlet } from "@tanstack/react-router";
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
import { useDensityStore } from "../../stores/useDensityStore.ts";
import { HttpNotice } from "../organisms/HttpNotice.tsx";
import { IdleWarning } from "../organisms/IdleWarning.tsx";
import { MainNav } from "../organisms/MainNav.tsx";
import { PendingChanges } from "../organisms/PendingChanges.tsx";
import { PendingIndicator } from "../organisms/PendingIndicator.tsx";
import { ShellPalette } from "../organisms/ShellPalette.tsx";
import { TaskAnnouncer } from "../organisms/TaskAnnouncer.tsx";
import { TaskOutputDialog } from "../organisms/TaskOutputDialog.tsx";
import { TasksMenu } from "../organisms/TasksMenu.tsx";
import { UserMenu } from "../organisms/UserMenu.tsx";

export function ShellLayout() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return <ShellFrame username={session.username} role={session.role} />;
}

function ShellFrame({
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shownTask, setShownTask] = useState<number | null>(null);
  const pageFocus = useNavigationTracker();
  const density = useDensityStore((s) => s.density);
  const setDensity = useDensityStore((s) => s.setDensity);
  const admin = role === "admin";

  const brand = (layout: "bar" | "panel", onNavigate?: () => void) => (
    <TopBarBrand
      layout={layout}
      productName={t("app.name")}
      hostName={layout === "bar" ? info.data?.hostname : undefined}
      render={<Link to="/" onClick={onNavigate} />}
    />
  );

  return (
    <PageFocusContext value={pageFocus}>
      <ShowTaskContext value={setShownTask}>
        <Shell
          mainId={MAIN_ID}
          skipLink={
            <SkipLink targetId={MAIN_ID}>{t("app.skipToMain")}</SkipLink>
          }
          topBar={
            <TopBar
              brand={brand("bar")}
              navToggle={
                <IconButton
                  label={t("app.openNav")}
                  icon={<MenuIcon />}
                  variant="plain"
                  onClick={() => setDrawerOpen(true)}
                />
              }
              search={
                <CommandPaletteTrigger
                  label={t("palette.trigger")}
                  onClick={() => setPaletteOpen(true)}
                />
              }
              density={
                <DensityToggle
                  density={density}
                  onDensityChange={setDensity}
                  label={t("density.label")}
                  hint={t(density === "compact" ? "density.on" : "density.off")}
                />
              }
              pending={admin ? <PendingIndicator /> : undefined}
              tasks={<TasksMenu />}
              user={<UserMenu username={username} />}
            />
          }
          notices={<HttpNotice role={role} />}
          pending={admin ? <PendingChanges /> : null}
          sidebar={
            <SideNav aria-label={t("app.navigation")}>
              <MainNav role={role} />
            </SideNav>
          }
          overlays={
            <>
              <SideNavDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                label={t("app.navigation")}
                closeLabel={t("app.closeNav")}
                brand={brand("panel", () => setDrawerOpen(false))}
              >
                <MainNav role={role} onNavigate={() => setDrawerOpen(false)} />
              </SideNavDrawer>
              <ShellPalette
                role={role}
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
              />
              <IdleWarning />
              <TaskOutputDialog
                id={shownTask}
                onClose={() => setShownTask(null)}
              />
              <TaskAnnouncer />
              <Toaster
                closeLabel={t("toast.close")}
                regionLabel={t("toast.region")}
              />
            </>
          }
        >
          <Outlet />
        </Shell>
      </ShowTaskContext>
    </PageFocusContext>
  );
}
