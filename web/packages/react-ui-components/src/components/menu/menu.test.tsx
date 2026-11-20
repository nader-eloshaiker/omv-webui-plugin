// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../select/select";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./menu";

// The highlight must carry a ring, not only the neutral ground (style guide 4.6, WCAG 2.4.7).
const RING = [
  "data-highlighted:outline-2",
  "data-highlighted:outline-focus-ring",
];

describe("keyboard highlight", () => {
  it("draws the focus ring on the highlighted menu item", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem>Edit</MenuItem>
          <MenuItem>Permissions</MenuItem>
        </MenuContent>
      </Menu>,
    );
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    const highlighted = await waitFor(() => {
      const item = screen
        .getAllByRole("menuitem")
        .find((element) => element.hasAttribute("data-highlighted"));
      expect(item).toBeDefined();
      return item as HTMLElement;
    });
    for (const cls of RING) {
      expect(highlighted.className).toContain(cls);
    }
  });

  it("draws the focus ring on select options too", () => {
    render(
      <Select defaultOpen defaultValue="20">
        <SelectTrigger />
        <SelectContent>
          <SelectItem value="0">Never</SelectItem>
          <SelectItem value="20">20 minutes</SelectItem>
        </SelectContent>
      </Select>,
    );
    for (const option of screen.getAllByRole("option")) {
      for (const cls of RING) {
        expect(option.className).toContain(cls);
      }
    }
  });
});
