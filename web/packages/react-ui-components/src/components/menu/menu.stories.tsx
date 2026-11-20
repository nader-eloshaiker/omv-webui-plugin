// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ExternalLink,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { IconButton } from "../button/button";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
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

/** A preference chosen in place (radio items) and a fixed link out of the interface (a link item). */
export const ChoicesAndLinks: Story = {
  render: () => (
    <Menu defaultOpen>
      <MenuTrigger
        render={<IconButton label="Account: admin" icon={<UserRound />} />}
      />
      <MenuContent>
        <MenuGroup>
          <MenuGroupLabel>Appearance</MenuGroupLabel>
          <MenuRadioGroup defaultValue="system">
            <MenuRadioItem value="system">Same as this device</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuLinkItem href="/" target="_blank" rel="noopener noreferrer">
          Open the classic interface
          <ExternalLink aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </MenuLinkItem>
      </MenuContent>
    </Menu>
  ),
};
