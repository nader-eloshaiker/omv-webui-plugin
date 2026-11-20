// SPDX-License-Identifier: GPL-3.0-or-later
// Any other address under /ui/: "not found", inside the shell, and only for a signed-in user (the
// layout's guard sends anyone else to sign-in).
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/$")({
  loader: () => {
    throw notFound();
  },
});
