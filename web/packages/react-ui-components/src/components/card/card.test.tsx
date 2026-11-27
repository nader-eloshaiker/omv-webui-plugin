// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Card,
  CardChevron,
  CardContent,
  CardExternalMark,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

describe("Card", () => {
  it("titles itself with a heading at the level asked for", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle level={3}>System</CardTitle>
        </CardHeader>
        <CardContent>Facts</CardContent>
      </Card>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "System" }),
    ).toBeInTheDocument();
  });

  it("renders as the element the page needs, named by its title", () => {
    render(
      <ul>
        <Card render={<section aria-labelledby="usage-title" />}>
          <CardHeader>
            <CardTitle id="usage-title">Usage</CardTitle>
          </CardHeader>
          <CardFooter>Updated every 20 seconds.</CardFooter>
        </Card>
      </ul>,
    );
    const region = screen.getByRole("region", { name: "Usage" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toHaveAttribute("data-slot", "card");
  });

  it("leaves the interface in a new tab, says so in its name, and cannot be talked out of rel", () => {
    render(
      <Card
        variant="action"
        opens="new-tab"
        newTabLabel="(opens in a new tab)"
        aria-labelledby="restart-step"
        render={<a href="/#/dashboard" target="_self" rel="opener" />}
      >
        <CardHeader>
          <CardTitle level={3}>The NAS needs a restart</CardTitle>
          <CardExternalMark />
        </CardHeader>
        <CardFooter>
          <span id="restart-step">Restart from the classic interface</span>
        </CardFooter>
      </Card>,
    );
    const link = screen.getByRole("link", {
      name: "Restart from the classic interface (opens in a new tab)",
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("data-opens", "new-tab");
    expect(
      link.querySelector("[data-slot=card-external-mark]"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("names a new-tab card from its content when nothing labels it", () => {
    render(
      <Card
        variant="action"
        opens="new-tab"
        newTabLabel="(opens in a new tab)"
        render={<a href="/" />}
      >
        Check Date and time in the classic interface
      </Card>,
    );
    expect(
      screen.getByRole("link", {
        name: "Check Date and time in the classic interface (opens in a new tab)",
      }),
    ).toBeInTheDocument();
  });

  it("stays in this interface by default", () => {
    render(
      <Card variant="action" render={<a href="#/storage/disks/sdb" />}>
        Open disk sdb
      </Card>,
    );
    const link = screen.getByRole("link", { name: "Open disk sdb" });
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("data-opens");
  });

  it("carries a state on its title's icon, never on the card's own ground (style guide 10)", () => {
    const { container } = render(
      <Card tone="warning">
        <CardHeader>
          <CardTitle tone="warning">Disk sdb is running warm</CardTitle>
          <CardChevron />
        </CardHeader>
      </Card>,
    );
    const card = container.querySelector("[data-slot=card]");
    expect(card).toHaveAttribute("data-tone", "warning");
    expect(card?.className).not.toMatch(
      /gradient|bg-\[image|border-s|border-l/,
    );
    expect(
      screen.getByRole("heading", { name: "Disk sdb is running warm" }),
    ).toHaveAttribute("data-tone", "warning");
    expect(container.querySelector("h2 [data-icon=triangle]")).not.toBeNull();
    expect(container.querySelector("svg:not([data-icon] *)")).toBeNull();
  });
});
