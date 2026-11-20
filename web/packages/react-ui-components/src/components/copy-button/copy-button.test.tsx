// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

const words = {
  label: "Copy full path of media",
  copiedLabel: "Copied",
  selectedLabel: "Selected. Press Ctrl+C to copy.",
};
const PATH = "/srv/dev-disk-by-uuid-0e8c-4b1f/media";

// jsdom has no secure-context flag: a page over HTTPS has one, a page over plain HTTP has it false.
function secureContext(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    get: () => secure,
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, "isSecureContext");
});

describe("CopyButton", () => {
  it("copies the whole value and says so", async () => {
    const user = userEvent.setup();
    secureContext(true);
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    const onCopy = vi.fn();
    render(<CopyButton {...words} text={PATH} onCopy={onCopy} />);
    await user.click(screen.getByRole("button", { name: words.label }));
    expect(writeText).toHaveBeenCalledWith(PATH);
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(onCopy).toHaveBeenCalledWith("copied");
  });

  it("without a clipboard (plain HTTP), selects the value in a field for Ctrl+C", async () => {
    const user = userEvent.setup();
    secureContext(false);
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyButton {...words} text={PATH} />);
    await user.click(screen.getByRole("button", { name: words.label }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(words.selectedLabel);
    const field = screen.getByRole("textbox", { name: words.label });
    expect(field).toHaveValue(PATH);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
    const input = field as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([
      0,
      PATH.length,
    ]);
    // The field goes when focus leaves it.
    await user.tab();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("falls back the same way when the browser refuses the write", async () => {
    const user = userEvent.setup();
    secureContext(true);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    render(
      <CopyButton
        {...words}
        label="Copy key 1"
        text="ssh-ed25519 AAAA"
        size="sm"
      >
        Copy key
      </CopyButton>,
    );
    await user.click(screen.getByRole("button", { name: "Copy key 1" }));
    expect(screen.getByRole("textbox", { name: "Copy key 1" })).toHaveValue(
      "ssh-ed25519 AAAA",
    );
  });
});
