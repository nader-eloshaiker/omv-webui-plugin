// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Users (phase 5 users design 1). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "../../../../components/pages/UsersPage.tsx";

export const Route = createFileRoute("/_signedIn/usermgmt/users/")({
  component: UsersPage,
});
