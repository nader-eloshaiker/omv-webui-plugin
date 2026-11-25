// SPDX-License-Identifier: GPL-3.0-or-later
// The palette by keyboard: `/` and Ctrl+K open it, typing narrows it, the arrow keys move the
// highlight and Enter goes; Escape closes it and focus returns. The jump keys: `g` then a letter,
// ignored while typing and while a dialog is in front.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { UiProvider } from "../ui-provider/ui-provider";
import {
  CommandPalette,
  CommandPaletteTrigger,
  type CommandItem,
} from "./command-palette";
import { useCommandKeys } from "./use-command-keys";

function Harness({
  went,
  applied,
}: {
  went: (page: string) => void;
  applied?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const items: CommandItem[] = [
    ...(applied
      ? [
          {
            id: "apply",
            label: "Apply 3 pending changes",
            group: "Do",
            hint: "SMB, SSH, Network",
            onSelect: applied,
          },
        ]
      : []),
    {
      id: "dashboard",
      label: "Dashboard",
      group: "Go to",
      shortcut: ["g", "o"],
      onSelect: () => went("dashboard"),
    },
    {
      id: "disks",
      label: "Disks",
      group: "Go to",
      hint: "Storage",
      shortcut: ["g", "d"],
      onSelect: () => went("disks"),
    },
    {
      id: "shares",
      label: "Shared folders",
      group: "Go to",
      hint: "Storage",
      onSelect: () => went("shares"),
    },
    {
      id: "cron",
      label: "Scheduled tasks",
      group: "Go to",
      hint: "System, in the classic interface",
      external: true,
      onSelect: () => went("cron"),
    },
  ];
  useCommandKeys({
    onOpenPalette: () => setOpen(true),
    jumps: { o: () => went("dashboard"), d: () => went("disks") },
    enabled: !open,
  });
  return (
    <UiProvider>
      <CommandPaletteTrigger
        label="Go to or do…"
        onClick={() => setOpen(true)}
      />
      <label>
        Share name <input />
      </label>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items}
        label="Go to or do"
        inputLabel="Search pages and actions"
        emptyMessage={(q) => `Nothing matches “${q}”.`}
        closeLabel="Close"
        keysHint="Arrow keys to move, Enter to go"
        externalLabel="classic interface"
      />
    </UiProvider>
  );
}

const field = () =>
  screen.findByRole("combobox", { name: "Search pages and actions" });

describe("CommandPalette", () => {
  it("opens with /, lists every page, narrows as you type and goes with Enter", async () => {
    const user = userEvent.setup();
    const went = vi.fn();
    render(<Harness went={went} />);
    await user.keyboard("/");
    const input = await field();
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(
      screen.getByRole("option", { name: /Scheduled tasks/ }),
    ).toHaveTextContent("classic interface");

    await user.keyboard("shared");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Shared folders"),
    ]);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(went).toHaveBeenCalledWith("shares"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves the highlight with the arrow keys and finds a page by its group", async () => {
    const user = userEvent.setup();
    const went = vi.fn();
    render(<Harness went={went} />);
    await user.click(screen.getByRole("button", { name: "Go to or do…" }));
    const input = await field();
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard("storage");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Disks"),
      expect.stringContaining("Shared folders"),
    ]);
    await waitFor(() => expect(options[0]).toHaveAttribute("data-highlighted"));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(options[1]).toHaveAttribute("data-highlighted"));
    await user.keyboard("{ArrowUp}{Enter}");
    await waitFor(() => expect(went).toHaveBeenCalledWith("disks"));
  });

  it("offers the pending action first, and says when nothing matches", async () => {
    const user = userEvent.setup();
    const applied = vi.fn();
    render(<Harness went={vi.fn()} applied={applied} />);
    await user.keyboard("{Control>}k{/Control}");
    const input = await field();
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      "Apply 3 pending changes",
    );
    await user.keyboard("telnet");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nothing matches “telnet”.")).toBeInTheDocument();
    await user.clear(await field());
    await user.keyboard("apply{Enter}");
    await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness went={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Go to or do…" });
    await user.click(trigger);
    await field();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe("useCommandKeys", () => {
  it("jumps with g then a letter", async () => {
    const user = userEvent.setup();
    const went = vi.fn();
    render(<Harness went={went} />);
    await user.keyboard("gd");
    expect(went).toHaveBeenCalledWith("disks");
    await user.keyboard("go");
    expect(went).toHaveBeenLastCalledWith("dashboard");
    // A letter without the leader does nothing.
    await user.keyboard("d");
    expect(went).toHaveBeenCalledTimes(2);
  });

  it("ignores the jump keys and / while typing in a field", async () => {
    const user = userEvent.setup();
    const went = vi.fn();
    render(<Harness went={went} />);
    const input = screen.getByRole("textbox", { name: "Share name" });
    await user.click(input);
    await user.keyboard("gd/");
    expect(input).toHaveValue("gd/");
    expect(went).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("jumps from a focused button that is unavailable, which swallows its keys", async () => {
    const user = userEvent.setup();
    const went = vi.fn();
    render(<Harness went={went} />);
    const trigger = screen.getByRole("button", { name: "Go to or do…" });
    trigger.addEventListener("keydown", (event) => event.preventDefault());
    trigger.focus();
    await user.keyboard("gd");
    expect(went).toHaveBeenCalledWith("disks");
  });

  it("opens the palette with Ctrl+K even from a field", async () => {
    const user = userEvent.setup();
    render(<Harness went={vi.fn()} />);
    await user.click(screen.getByRole("textbox", { name: "Share name" }));
    await user.keyboard("{Control>}k{/Control}");
    expect(await field()).toBeInTheDocument();
  });
});
