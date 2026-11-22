// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, TypeToConfirmDialog } from "./confirm-dialog";

const words = {
  title: "Delete shared folder media?",
  description: "2 SMB shares use it and stop working.",
  confirmLabel: "Delete shared folder",
  cancelLabel: "Cancel",
};

function Destructive({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <ConfirmDialog
      {...words}
      open={open}
      onOpenChange={setOpen}
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}

function Typed({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <TypeToConfirmDialog
        {...words}
        title="Wipe disk /dev/sdb?"
        confirmLabel="Wipe disk"
        open={open}
        onOpenChange={setOpen}
        confirmText="/dev/sdb"
        prompt="Type /dev/sdb to confirm."
        onConfirm={onConfirm}
      />
    </>
  );
}

describe("ConfirmDialog, destructive", () => {
  it("starts with focus on Cancel, not on the act", async () => {
    render(<Destructive onConfirm={vi.fn()} />);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(words.title);
  });

  it("does not confirm on Enter", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Destructive onConfirm={onConfirm} />);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms only from its own button", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Destructive onConfirm={onConfirm} />);
    await user.click(
      await screen.findByRole("button", { name: "Delete shared folder" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("TypeToConfirmDialog", () => {
  it("keeps the act unavailable until the name is typed exactly", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Typed onConfirm={onConfirm} />);
    const act = await screen.findByRole("button", { name: "Wipe disk" });
    const input = screen.getByRole("textbox", {
      name: "Type /dev/sdb to confirm.",
    });

    expect(act).toHaveAttribute("aria-disabled", "true");
    await user.click(act);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(input, "/dev/SDB");
    expect(act).toHaveAttribute("aria-disabled", "true");

    await user.clear(input);
    await user.type(input, "/dev/sdb");
    expect(act).not.toHaveAttribute("aria-disabled", "true");
    await user.click(act);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("starts on Cancel, and Enter in the field does not confirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Typed onConfirm={onConfirm} />);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    const input = screen.getByRole("textbox", {
      name: "Type /dev/sdb to confirm.",
    });
    await user.type(input, "/dev/sdb{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens empty every time", async () => {
    const user = userEvent.setup();
    render(<Typed onConfirm={vi.fn()} />);
    await user.type(
      await screen.findByRole("textbox", { name: "Type /dev/sdb to confirm." }),
      "/dev/sdb",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(
      await screen.findByRole("textbox", { name: "Type /dev/sdb to confirm." }),
    ).toHaveValue("");
  });
});

describe("ConfirmDialog, plain (Undo)", () => {
  function Undo({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = React.useState(true);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Undo 3 changes?"
        description="The saved changes to SMB, SSH and Network are discarded."
        confirmLabel="Undo 3 changes"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
      />
    );
  }

  it("starts on Cancel, names what is lost, and asks for no typing", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Undo onConfirm={onConfirm} />);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "The saved changes to SMB, SSH and Network are discarded.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog, keyboard", () => {
  // The page around the dialog: a skip link before it and a control after it, as in the app shell.
  function Page() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <a href="#main">Skip to main content</a>
        <button type="button" onClick={() => setOpen(true)}>
          Grow
        </button>
        <TypeToConfirmDialog
          {...words}
          title="Wipe disk /dev/sdb?"
          confirmLabel="Wipe disk"
          open={open}
          onOpenChange={setOpen}
          confirmText="/dev/sdb"
          prompt="Type /dev/sdb to confirm."
          onConfirm={vi.fn()}
        />
        <button type="button">After the dialog</button>
      </>
    );
  }

  // Waits out the frame on which Base UI's focus guards would move focus, so a trap that only works
  // a frame later is not mistaken for one that holds.
  const nextFrame = () =>
    act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );

  it.each([
    ["Tab", false],
    ["Shift+Tab", true],
  ])("keeps %s inside the dialog, at every step", async (_, shift) => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Grow" }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    const popup = screen.getByRole("alertdialog");
    const input = screen.getByRole("textbox", {
      name: "Type /dev/sdb to confirm.",
    });
    const wipe = screen.getByRole("button", { name: "Wipe disk" });

    const visited: Element[] = [];
    for (let step = 0; step < 7; step += 1) {
      await user.tab({ shift });
      // In the same keystroke, not a frame later: focus never rests outside the popup.
      expect(popup).toContainElement(document.activeElement as HTMLElement);
      await nextFrame();
      expect(popup).toContainElement(document.activeElement as HTMLElement);
      visited.push(document.activeElement as Element);
    }
    // Document order is the field, Cancel, Wipe disk; from Cancel the order cycles that way round.
    const cycle = shift ? [input, wipe, cancel] : [wipe, input, cancel];
    expect(visited.slice(0, 3)).toEqual(cycle);
    expect(visited.slice(3, 6)).toEqual(cycle);
  });
});

describe("ConfirmDialog, lists and a checkbox (the deletes)", () => {
  const SECTIONS = [
    {
      title: "What goes",
      items: [
        "Their account and password: alex can no longer sign in here, or open shared folders from their computers.",
        "Their SSH sign-in.",
      ],
    },
    {
      title: "What stays",
      items: ["Their files, wherever they are on the NAS."],
    },
  ];

  function DeletePerson({
    onConfirm = () => undefined,
    onChecked = () => undefined,
  }: {
    onConfirm?: () => void;
    onChecked?: (checked: boolean) => void;
  }) {
    const [open, setOpen] = React.useState(true);
    const [checked, setChecked] = React.useState(true);
    return (
      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete alex?"
        sections={SECTIONS}
        checkbox={{
          label:
            "Also take alex off the access lists of 2 shared folders: Photos, Music.",
          hint: "If you leave this, those folders keep an entry for alex.",
          note: "After this, nobody can open Photos from other computers: alex was the only one with access.",
          checked,
          onCheckedChange: (next) => {
            setChecked(next);
            onChecked(next);
          },
        }}
        confirmLabel="Delete person"
        cancelLabel="Cancel"
        confirmText="alex"
        prompt="Type alex to confirm."
        onConfirm={onConfirm}
      >
        <p>Scheduled jobs set to use alex stop working for them.</p>
      </TypeToConfirmDialog>
    );
  }

  it("reads the lists as the dialog's description, under h3 headings", async () => {
    render(<DeletePerson />);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete alex?");
    expect(dialog).toHaveAccessibleDescription(
      /^What goes.*Their account and password.*Their SSH sign-in\..*What stays.*Their files/,
    );
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["What goes", "What stays"]);
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("puts the sentence first in the description when there is one", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        variant="destructive"
        title="Delete the group family?"
        description="2 people are taken out of it: alex, sam."
        sections={[{ title: "What stays", items: ["Their own access."] }]}
        confirmLabel="Delete group"
        cancelLabel="Cancel"
        onConfirm={() => undefined}
      />,
    );
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleDescription(
      /^2 people are taken out of it: alex, sam\..*What stays.*Their own access\./,
    );
  });

  it("places the checkbox before the typed field, and shows its note while ticked", async () => {
    const user = userEvent.setup();
    const onChecked = vi.fn();
    render(<DeletePerson onChecked={onChecked} />);
    const box = await screen.findByRole("checkbox", {
      name: "Also take alex off the access lists of 2 shared folders: Photos, Music.",
    });
    const typed = screen.getByRole("textbox", {
      name: "Type alex to confirm.",
    });
    expect(
      box.compareDocumentPosition(typed) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(box).toHaveAccessibleDescription(
      /After this, nobody can open Photos.*If you leave this/,
    );
    await user.click(box);
    expect(onChecked).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText(/After this, nobody can open Photos/)).toBeNull();
    expect(box).toHaveAccessibleDescription(
      "If you leave this, those folders keep an entry for alex.",
    );
  });

  it("starts on Cancel, keeps the act unavailable but focusable until the name matches, and Enter in the field never confirms", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeletePerson onConfirm={onConfirm} />);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    const confirm = screen.getByRole("button", { name: "Delete person" });
    await user.tab();
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    // Ticking the box does not stand in for typing the name.
    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    const typed = screen.getByRole("textbox", {
      name: "Type alex to confirm.",
    });
    await user.type(typed, "alex{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("takes a checkbox in a plain confirmation too", async () => {
    const user = userEvent.setup();
    function Plain() {
      const [checked, setChecked] = React.useState(false);
      return (
        <ConfirmDialog
          open
          onOpenChange={() => undefined}
          title="Delete the group family?"
          description="Nobody is in it."
          checkbox={{
            label:
              "Also take family off the access lists of 1 shared folder: Photos.",
            checked,
            onCheckedChange: setChecked,
          }}
          confirmLabel="Delete group"
          cancelLabel="Cancel"
          onConfirm={() => undefined}
        />
      );
    }
    render(<Plain />);
    const box = await screen.findByRole("checkbox");
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
