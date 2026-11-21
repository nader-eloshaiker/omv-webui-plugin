// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A, "Add storage" (phase 5 file-systems design 6). No parameter: nothing is chosen from the
// address (D17), and opening it only reads (R9). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { AddStorageRoutePage } from "../../../../components/pages/AddStoragePage.tsx";

export const Route = createFileRoute("/_signedIn/storage/filesystems/add")({
  component: AddStorageRoutePage,
});
