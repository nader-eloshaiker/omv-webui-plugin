// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person" (phase 5 users design 6). No parameter; opening it only reads (R9). A static route,
// matched before $name, so a person called `add` is reached from the list by a link (design 14.2).
import { createFileRoute } from "@tanstack/react-router";
import { AddPersonPage } from "../../../../components/pages/AddPersonPage.tsx";

export const Route = createFileRoute("/_signedIn/usermgmt/users/add")({
  component: AddPersonPage,
});
