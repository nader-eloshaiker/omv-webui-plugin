// SPDX-License-Identifier: GPL-3.0-or-later
// The router's error state: a plain sentence, the backend's message as text, and nothing from any
// other kind of error (UI-9).
import { RpcError } from "@omv-webui/react-api-omv/transport";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../services/i18n/index.ts";
import { RouteErrorPage } from "./RouteErrorPage.tsx";

function renderFailing(error: unknown) {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: "/",
    loader: () => {
      throw error;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultErrorComponent: RouteErrorPage,
  });
  render(<RouterProvider router={router} />);
}

describe("RouteErrorPage", () => {
  it("says so plainly and shows the backend's message as text", async () => {
    renderFailing(
      new RpcError({
        status: 500,
        code: 0,
        message: "<b>Failed</b> to read the disks.",
        operationId: "x",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "This page could not be shown",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("<b>Failed</b> to read the disks."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to the dashboard" }),
    ).toBeInTheDocument();
  });

  it("shows nothing of an error that is not the backend's", async () => {
    renderFailing(new TypeError("internal detail at line 42"));
    await screen.findByRole("heading", {
      name: "This page could not be shown",
    });
    expect(document.body.textContent).not.toContain("internal detail");
  });
});
