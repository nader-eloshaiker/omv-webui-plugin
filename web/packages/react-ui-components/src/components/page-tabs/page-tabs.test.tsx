// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PageTab, PageTabs } from "./page-tabs";

describe("PageTabs", () => {
  it("is a named navigation of links, the current one marked as the page", () => {
    render(
      <PageTabs aria-label="Services">
        <PageTab href="/smb">SMB/CIFS</PageTab>
        <PageTab href="/nfs" current>
          NFS
        </PageTab>
        <PageTab href="/ssh">SSH</PageTab>
      </PageTabs>,
    );
    const nav = screen.getByRole("navigation", { name: "Services" });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "NFS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "SMB/CIFS" })).not.toHaveAttribute(
      "aria-current",
    );
    // Not ARIA tabs: each view is an address of its own.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("is reached link by link with Tab", async () => {
    const user = userEvent.setup();
    render(
      <PageTabs aria-label="Services">
        <PageTab href="/smb" current>
          SMB/CIFS
        </PageTab>
        <PageTab href="/nfs">NFS</PageTab>
      </PageTabs>,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "SMB/CIFS" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "NFS" })).toHaveFocus();
  });

  it("renders through the caller's link element", () => {
    render(
      <PageTabs aria-label="Services">
        <PageTab render={<a href="/routed" data-router="yes" />} current>
          SSH
        </PageTab>
      </PageTabs>,
    );
    const link = screen.getByRole("link", { name: "SSH" });
    expect(link).toHaveAttribute("data-router", "yes");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
