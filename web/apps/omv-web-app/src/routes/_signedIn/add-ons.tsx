// SPDX-License-Identifier: GPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { AddOnsPage } from "../../components/pages/AddOnsPage.tsx";

export const Route = createFileRoute("/_signedIn/add-ons")({
  component: AddOnsPage,
});
