// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreHorizontal, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { IconButton } from "../button/button";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "./menu";

const meta = { title: "Components/Menu", component: Menu } satisfies Meta<
  typeof Menu
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowActions: Story = {
  render: () => (
    <Menu defaultOpen>
      <MenuTrigger
        render={
          <IconButton
            label="Actions for shared folder media"
            icon={<MoreHorizontal />}
          />
        }
      />
      <MenuContent>
        <MenuGroup>
          <MenuGroupLabel>media</MenuGroupLabel>
          <MenuItem>
            <Pencil aria-hidden="true" />
            Edit
          </MenuItem>
          <MenuItem>
            <ShieldCheck aria-hidden="true" />
            Permissions
          </MenuItem>
          <MenuItem disabled>
            <span className="flex flex-col">
              <span>Access control list</span>
              <span className="text-sm text-muted-foreground">
                The file system does not support access control lists.
              </span>
            </span>
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem>
          <Trash2 aria-hidden="true" />
          Delete…
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};
