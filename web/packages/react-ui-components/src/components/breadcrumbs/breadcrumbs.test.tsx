// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreadcrumbItem, Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("is a named navigation of links to the pages above, the current page last as text", () => {
    const { container } = render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem href="/disks">Disks</BreadcrumbItem>
        <BreadcrumbItem current>
          <code>/dev/sdb</code>
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Disks" })).toHaveAttribute(
      "href",
      "/disks",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const current = screen.getByText("/dev/sdb").parentElement;
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current?.tagName).toBe("SPAN");
    // The separators are decoration only.
    const separators = container.querySelectorAll(
      '[data-slot="breadcrumb-separator"]',
    );
    expect(separators).toHaveLength(1);
    expect(separators[0]).toHaveAttribute("aria-hidden", "true");
    expect(nav).toHaveTextContent(/^Disks\/dev\/sdb$/);
  });

  it("renders through the caller's link element", () => {
    render(
      <Breadcrumbs aria-label="Breadcrumb">
        <BreadcrumbItem render={<a href="/routed" data-router="yes" />}>
          Disk health
        </BreadcrumbItem>
        <BreadcrumbItem render={<a href="/second" />}>Second</BreadcrumbItem>
        <BreadcrumbItem current>Set up monitoring</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByRole("link", { name: "Disk health" })).toHaveAttribute(
      "data-router",
      "yes",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
