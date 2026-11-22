// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Groups (phase 5 users design 8). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { GroupsPage } from "../../../../components/pages/GroupsPage.tsx";

export const Route = createFileRoute("/_signedIn/usermgmt/groups/")({
  component: GroupsPage,
});
