// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Arrangement } from "./arrangement";

const arrangement = (
  <Arrangement
    question="What happens if a disk fails?"
    showFailingLabel="Show a disk failing"
    hideFailingLabel="Bring the disk back"
    currentLabel="pool uses this"
    parityLetter="P"
    options={[
      {
        id: "mirror",
        kind: "mirror",
        disks: 2,
        title: "Mirror",
        usable: "Half the space",
        survives: "Keeps working when one disk fails",
        whenFailing: "Nothing is lost: the other disk has every block.",
        current: true,
      },
      {
        id: "stripe",
        kind: "stripe",
        disks: 2,
        title: "Stripe",
        usable: "All the space",
        survives: "Any disk failing loses everything",
        whenFailing:
          "Half of every file was on the failed disk: all of it is lost.",
      },
    ]}
  />
);

const item = (kind: string) =>
  document.querySelector(`[data-kind="${kind}"]`) as HTMLElement;

describe("Arrangement", () => {
  it("previews a disk failing: crossed, and lost blocks only where data is lost", async () => {
    const user = userEvent.setup();
    render(arrangement);
    const button = screen.getByRole("button", { name: "Show a disk failing" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector("[data-dead]")).toBeNull();

    await user.click(button);
    expect(
      screen.getByRole("button", { name: "Bring the disk back" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(item("mirror").querySelectorAll("[data-dead]")).toHaveLength(1);
    expect(item("stripe").querySelectorAll("[data-dead]")).toHaveLength(1);
    expect(item("mirror").querySelector('[data-part="lost"]')).toBeNull();
    expect(item("stripe").querySelectorAll('[data-part="lost"]')).toHaveLength(
      6,
    );
    // The same fact in words, in a polite live region.
    expect(
      screen.getByText(
        "Half of every file was on the failed disk: all of it is lost.",
      ),
    ).toHaveAttribute("aria-live", "polite");

    await user.click(
      screen.getByRole("button", { name: "Bring the disk back" }),
    );
    expect(document.querySelector("[data-dead]")).toBeNull();
    expect(document.querySelector('[data-part="lost"]')).toBeNull();
  });

  it("marks the layout in use", () => {
    render(arrangement);
    expect(item("mirror")).toHaveAttribute("data-current");
    expect(screen.getByText("pool uses this")).toBeInTheDocument();
  });
});
