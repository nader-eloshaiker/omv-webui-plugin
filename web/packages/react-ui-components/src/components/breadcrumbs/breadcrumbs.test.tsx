// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreadcrumbItem, Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("is a named navigation holding one link to the parent page, with no separator", () => {
    const { container } = render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem href="/storage/shared-folders">
          Shared folders
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(nav).getByRole("link", { name: "Shared folders" }),
    ).toHaveAttribute("href", "/storage/shared-folders");
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
    expect(within(nav).queryByRole("list")).toBeNull();
    expect(nav).toHaveTextContent(/^Shared folders$/);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows only the nearest ancestor of a full trail, and never the current page", () => {
    render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem href="/storage">Storage</BreadcrumbItem>
        <BreadcrumbItem href="/storage/smart">Disk health</BreadcrumbItem>
        <BreadcrumbItem current>
          <code>/dev/sdb</code>
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
    expect(
      within(nav).getByRole("link", { name: "Disk health" }),
    ).toHaveAttribute("href", "/storage/smart");
    expect(screen.queryByText("Storage")).toBeNull();
    expect(screen.queryByText("/dev/sdb")).toBeNull();
    expect(nav.querySelector("[aria-current]")).toBeNull();
  });

  it("renders through the caller's link element", () => {
    render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem render={<a href="/routed" data-router="yes" />}>
          Disk health
        </BreadcrumbItem>
        <BreadcrumbItem current>Set up monitoring</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByRole("link", { name: "Disk health" })).toHaveAttribute(
      "data-router",
      "yes",
    );
  });

  it("renders nothing when there is no page above to link to", () => {
    const { container } = render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem current>Disks</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
