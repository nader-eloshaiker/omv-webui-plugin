// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

function Page({ onKeyDown }: { onKeyDown?: () => void }) {
  return (
    <>
      <a href="#main">Skip to main content</a>
      <Dialog>
        <DialogTrigger>Add shared folder</DialogTrigger>
        <DialogContent onKeyDown={onKeyDown}>
          <DialogHeader>
            <DialogTitle>Add shared folder</DialogTitle>
            <DialogDescription>
              Saving adds it to the pending changes; nothing is applied yet.
            </DialogDescription>
          </DialogHeader>
          <label>
            Name
            <input />
          </label>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
            <button type="button">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <button type="button">After the dialog</button>
    </>
  );
}

const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

describe("Dialog, keyboard", () => {
  it.each([
    ["Tab", false],
    ["Shift+Tab", true],
  ])("keeps %s inside the dialog, at every step", async (_, shift) => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Add shared folder" }));
    const popup = await screen.findByRole("dialog");
    const name = screen.getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name).toHaveFocus());
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const save = screen.getByRole("button", { name: "Save" });

    const visited: Element[] = [];
    for (let step = 0; step < 7; step += 1) {
      await user.tab({ shift });
      expect(popup).toContainElement(document.activeElement as HTMLElement);
      await nextFrame();
      expect(popup).toContainElement(document.activeElement as HTMLElement);
      visited.push(document.activeElement as Element);
    }
    const cycle = shift ? [save, cancel, name] : [cancel, save, name];
    expect(visited.slice(0, 3)).toEqual(cycle);
    expect(visited.slice(3, 6)).toEqual(cycle);
  });

  it("still calls the caller's own key handler", async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(<Page onKeyDown={onKeyDown} />);
    await user.click(screen.getByRole("button", { name: "Add shared folder" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus(),
    );
    await user.tab();
    expect(onKeyDown).toHaveBeenCalled();
  });
});
