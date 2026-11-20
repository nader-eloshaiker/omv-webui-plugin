// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./search-field";

const words = {
  label: "Search shared folders",
  clearLabel: "Clear the search",
  hint: "Search looks at every detail of a folder.",
};

describe("SearchField", () => {
  it("is a labelled search box described by its hint", () => {
    render(<SearchField {...words} />);
    const box = screen.getByRole("searchbox", { name: words.label });
    expect(box.getAttribute("aria-describedby")).toContain(
      screen.getByText(words.hint).id,
    );
    expect(screen.queryByRole("button", { name: words.clearLabel })).toBeNull();
  });

  it("clears with its button, and focus goes back to the box", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchField {...words} onValueChange={onValueChange} />);
    const box = screen.getByRole("searchbox");
    await user.type(box, "media");
    expect(onValueChange).toHaveBeenLastCalledWith("media");
    await user.click(screen.getByRole("button", { name: words.clearLabel }));
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("clears with Escape, and leaves Escape on an empty box to the page", async () => {
    const user = userEvent.setup();
    const onPageKey = vi.fn();
    render(
      // A dialog around the field, which closes on Escape.
      <div
        role="dialog"
        aria-label="Find a folder"
        onKeyDown={(event) => onPageKey(event.key)}
      >
        <SearchField {...words} defaultValue="backup" />
      </div>,
    );
    const box = screen.getByRole("searchbox");
    box.focus();
    await user.keyboard("{Escape}");
    expect(box).toHaveValue("");
    expect(onPageKey).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onPageKey).toHaveBeenCalledWith("Escape");
  });
});
