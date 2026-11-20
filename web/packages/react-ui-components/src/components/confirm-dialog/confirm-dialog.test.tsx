// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, waitFor } from "@testing-library/react";
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
