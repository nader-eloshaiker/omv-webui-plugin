// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import {
  PageAnswer,
  PageAnswerAction,
  PageAnswerAside,
  PageAnswerBody,
  PageAnswerDescription,
  PageAnswerHeadline,
  PageAnswerHeadlineSkeleton,
  PageAnswerKicker,
} from "./page-answer";

function Answer({
  headlineRef,
}: {
  headlineRef?: React.Ref<HTMLParagraphElement>;
}) {
  const titleId = React.useId();
  return (
    <PageAnswer aria-labelledby={titleId}>
      <PageAnswerBody>
        <h1 id={titleId}>Dashboard</h1>
        <PageAnswerKicker>Read at 10:42:07</PageAnswerKicker>
        <PageAnswerHeadline ref={headlineRef}>
          No problems found
        </PageAnswerHeadline>
        <PageAnswerDescription>
          Disk health has not been checked since you signed in.
        </PageAnswerDescription>
        <PageAnswerAction>
          <button type="button">Check disk health</button>
        </PageAnswerAction>
      </PageAnswerBody>
      <PageAnswerAside>
        <div role="group" aria-label="Health of this NAS" />
      </PageAnswerAside>
    </PageAnswer>
  );
}

describe("PageAnswer", () => {
  it("is a region named by the page title, whose headline is not a heading", () => {
    render(<Answer />);
    const region = screen.getByRole("region", { name: "Dashboard" });
    expect(region.tagName).toBe("SECTION");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText("No problems found").tagName).toBe("P");
    expect(
      screen.getByRole("group", { name: "Health of this NAS" }),
    ).toBeInTheDocument();
  });

  it("lets focus land on the headline when the button that had it goes", () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<Answer headlineRef={ref} />);
    const headline = screen.getByText("No problems found");
    expect(headline).toHaveAttribute("tabindex", "-1");
    ref.current?.focus();
    expect(headline).toHaveFocus();
  });

  it("puts the aside beside the words from its own width of 600px, and follows the density", () => {
    render(<Answer />);
    const region = screen.getByRole("region", { name: "Dashboard" });
    expect(region.className).toMatch(/@container\/answer/);
    expect(region.className).toMatch(/compact:pt-4/);
    expect(region.firstElementChild?.className).toMatch(
      /@min-\[37\.5rem\]\/answer:flex-row/,
    );
  });

  it("stands in for the headline at the display step while loading", () => {
    const { container } = render(<PageAnswerHeadlineSkeleton />);
    const bar = container.querySelector(
      "[data-slot=page-answer-headline-skeleton]",
    );
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar?.className).toMatch(/text-display/);
    expect(bar?.className).toMatch(/w-3\/5/);
  });
});
