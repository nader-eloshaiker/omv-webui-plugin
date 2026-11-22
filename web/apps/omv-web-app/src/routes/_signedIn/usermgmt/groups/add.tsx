// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group" (phase 5 users design 10). No parameter; opening it only reads (R9). Static, so it
// wins over $group.
import { createFileRoute } from "@tanstack/react-router";
import { AddGroupPage } from "../../../../components/pages/AddGroupPage.tsx";

export const Route = createFileRoute("/_signedIn/usermgmt/groups/add")({
  component: AddGroupPage,
});
