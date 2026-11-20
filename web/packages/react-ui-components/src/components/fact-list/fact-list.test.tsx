// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "./fact-list";

describe("FactList", () => {
  it("is a description list of terms and values, with server text as text", () => {
    render(
      <FactList>
        <FactListItem>
          <FactListLabel>Name</FactListLabel>
          <FactListValue variant="identifier">nas01</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Description</FactListLabel>
          <FactListValue>{"<img src=x onerror=alert(1)>"}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Processor</FactListLabel>
          <FactListValue variant="missing">Not reported</FactListValue>
        </FactListItem>
      </FactList>,
    );
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["Name", "Description", "Processor"]);
    const values = screen.getAllByRole("definition");
    expect(values[0]).toHaveAttribute("data-variant", "identifier");
    expect(values[1]).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(values[1]?.querySelector("img")).toBeNull();
    expect(values[1]).toHaveAttribute("dir", "auto");
    expect(values[2]).toHaveAttribute("data-variant", "missing");
  });

  it("draws its skeleton out of reach of assistive technology", () => {
    const { container } = render(<FactListSkeleton rows={4} />);
    const skeleton = container.querySelector("[data-slot=fact-list-skeleton]");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton?.querySelectorAll("[data-slot=skeleton]")).toHaveLength(8);
    expect(screen.queryByRole("term")).toBeNull();
  });
});
