// SPDX-License-Identifier: GPL-3.0-or-later
// A page of OMV's menu that only the classic interface has so far. The two path segments only select
// an entry of the fixed navigation table (navigation.ts); anything else is "not found" (UI-4). The
// link out is that entry's literal path (UI-3). Pages built here get their own, more specific routes.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { MenuPage } from "../../../components/pages/MenuPage.tsx";
import { findNavPage } from "../../../navigation/navigation.ts";

export const Route = createFileRoute("/_signedIn/$group/$item")({
  loader: ({ params }) => {
    const page = findNavPage(params.group, params.item);
    if (!page) {
      throw notFound();
    }
    return page;
  },
  component: MenuPage,
});
