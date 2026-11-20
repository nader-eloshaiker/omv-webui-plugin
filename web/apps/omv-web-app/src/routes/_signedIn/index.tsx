// SPDX-License-Identifier: GPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../../components/pages/DashboardPage.tsx";

export const Route = createFileRoute("/_signedIn/")({
  component: DashboardPage,
});
