// SPDX-License-Identifier: GPL-3.0-or-later
// Help when asked: nothing opens by itself; the (?) and a glossary term open their answer and say
// they are open; Escape closes it and focus goes back; "Which should I choose?" folds into its (?)
// with tips off, keeping its name and its answer. Text from a caller renders as text.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TipsProvider } from "../tip/tips-provider";
import { GlossaryTerm, HelpDisclosure, HelpPopover } from "./help";

const WORKGROUP =
  "The name Windows computers use to find each other on a home network.";

describe("HelpPopover", () => {
  it("opens its answer only when asked, and closes on Escape with focus back on the button", async () => {
    const user = userEvent.setup();
    render(
      <HelpPopover label="What is a workgroup?">
        <p>{WORKGROUP}</p>
      </HelpPopover>,
    );
    const button = screen.getByRole("button", { name: "What is a workgroup?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(WORKGROUP)).not.toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(WORKGROUP)).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-expanded", "false");
    });
    expect(button).toHaveFocus();
  });
});

describe("GlossaryTerm", () => {
  it("shows the term in the text and opens what it means", async () => {
    const user = userEvent.setup();
    render(
      <p>
        Windows and Mac sharing (
        <GlossaryTerm term="SMB" label="SMB, what it means">
          Server Message Block, the way Windows and Mac computers open folders
          over a network.
        </GlossaryTerm>
        ) is on.
      </p>,
    );
    const term = screen.getByRole("button", { name: "SMB, what it means" });
    expect(term).toHaveTextContent("SMB");
    await user.click(term);
    expect(screen.getByRole("dialog", { name: "SMB" })).toHaveTextContent(
      /Server Message Block/,
    );
  });

  it("renders markup-looking text as text", async () => {
    const user = userEvent.setup();
    render(
      <GlossaryTerm term="<b>NFS</b>" label="NFS, what it means">
        {"<img src=x onerror=alert(1)>"}
      </GlossaryTerm>,
    );
    await user.click(
      screen.getByRole("button", { name: "NFS, what it means" }),
    );
    expect(
      screen.getByText(/<img src=x onerror=alert\(1\)>/),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("HelpDisclosure", () => {
  const answer = "Choose Windows and Mac unless a device asks for NFS.";
  const help = (show: boolean) => (
    <TipsProvider show={show} seen={[]} onSeen={() => undefined}>
      <HelpDisclosure question="Which should I choose?">
        <p>{answer}</p>
      </HelpDisclosure>
    </TipsProvider>
  );

  it("is a disclosure under the question with tips on", async () => {
    const user = userEvent.setup();
    render(help(true));
    const trigger = screen.getByRole("button", {
      name: "Which should I choose?",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(answer)).toBeVisible();
  });

  it("folds into its (?) with the same name and answer with tips off", async () => {
    const user = userEvent.setup();
    render(help(false));
    const button = screen.getByRole("button", {
      name: "Which should I choose?",
    });
    expect(button).not.toHaveTextContent("Which should I choose?");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(answer)).toBeVisible();
  });

  it("is a disclosure outside a TipsProvider", () => {
    render(
      <HelpDisclosure question="Which should I choose?">
        <p>{answer}</p>
      </HelpDisclosure>,
    );
    expect(
      screen.getByRole("button", { name: "Which should I choose?" }),
    ).toHaveTextContent("Which should I choose?");
  });
});
