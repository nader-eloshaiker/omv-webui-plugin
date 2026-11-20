// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card";

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
});
