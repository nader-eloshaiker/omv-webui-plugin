// SPDX-License-Identifier: GPL-3.0-or-later
// The answer as the dashboard sets it: today's title-sized answer unchanged by default; the hero size
// as the page's headline; the check it waits for, the sentence after it and the drawing beside it in
// their places, none of them inside the live region that announces a new answer.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NasAnswer } from "./nas-answer";

const REASON =
  "Disks report their health only when asked, and asking wakes any that are asleep, so the check waits for you.";

function Hero(props: Partial<React.ComponentProps<typeof NasAnswer>>) {
  return (
    <NasAnswer
      size="hero"
      status="unknown"
      title="No problems found so far."
      reason={REASON}
      action={<button type="button">Check disk health</button>}
      after="You could also put sde to use."
      aside={<figure aria-label="nas, five disks." role="img" />}
      {...props}
    />
  );
}

describe("NasAnswer", () => {
  it("is today's answer by default: the title step, an h1, no aside", () => {
    const { container } = render(
      <NasAnswer
        status="ok"
        title="Everything is working."
        reason="All four drives have space."
      />,
    );
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Everything is working.",
    });
    expect(heading.className).toMatch(/\btext-title\b/u);
    const region = screen.getByRole("region", {
      name: "Everything is working.",
    });
    expect(region).toHaveAttribute("data-size", "title");
    expect(region.className).not.toMatch(/@container/u);
    expect(container.querySelector("[data-slot=nas-answer-aside]")).toBeNull();
  });

  it("sets the hero size as the page's headline", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toMatch(/\btext-hero\b/u);
    expect(heading.className).not.toMatch(/\btext-title\b/u);
  });

  it("places the action, the sentence after it and the drawing outside the live region", () => {
    const { container } = render(<Hero />);
    const live = container.querySelector("[aria-live=polite]");
    expect(live).toContainElement(screen.getByRole("heading"));
    expect(live).toContainElement(screen.getByText(REASON));
    const action = screen.getByRole("button", { name: "Check disk health" });
    const after = screen.getByText("You could also put sde to use.");
    const aside = screen.getByRole("img", { name: "nas, five disks." });
    for (const el of [action, after, aside]) {
      expect(live).not.toContainElement(el);
    }
    // In reading order: the sentence, its reason, the action, the sentence after, the drawing.
    expect(
      action.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      after.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("region").className).toMatch(
      /@container\/nas-answer/u,
    );
  });

  it("takes an h2 under a welcome that holds the h1", () => {
    render(<Hero size="title" headingLevel={2} aside={undefined} />);
    expect(screen.getByRole("heading", { level: 2 }).className).toMatch(
      /\btext-title\b/u,
    );
  });

  it("shows neither the action nor the sentence after it while the first read is in flight", () => {
    render(<Hero title="Reading the NAS…" loading />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("You could also put sde to use.")).toBeNull();
    expect(screen.queryByText(REASON)).toBeNull();
    expect(screen.getByRole("img", { name: "nas, five disks." })).toBeVisible();
  });

  it("renders words that look like markup as text", () => {
    const { container } = render(
      <NasAnswer status="warning" title="<b>Backup</b> is full." />,
    );
    expect(screen.getByText("<b>Backup</b> is full.")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });
});
