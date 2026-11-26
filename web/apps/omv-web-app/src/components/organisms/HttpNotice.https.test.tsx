// @vitest-environment-options {"url": "https://localhost/ui/"}
// SPDX-License-Identifier: GPL-3.0-or-later
// UI-12, the other half: on a page served over HTTPS there is no unencrypted-connection notice.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findDashboard } from "../../test/dashboard.ts";
import { renderApp } from "../../test/renderApp.tsx";

describe("the unencrypted-connection notice on https:", () => {
  it("does not show", async () => {
    expect(window.location.protocol).toBe("https:");
    await renderApp({ signedIn: true });
    await findDashboard();
    expect(
      screen.queryByRole("region", { name: "Connection notice" }),
    ).not.toBeInTheDocument();
  });
});
