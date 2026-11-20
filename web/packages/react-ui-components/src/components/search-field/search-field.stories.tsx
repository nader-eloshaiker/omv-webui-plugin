// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchField } from "./search-field";

const meta = {
  title: "Components/SearchField",
  component: SearchField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    label: "Search shared folders",
    clearLabel: "Clear the search",
    placeholder: "Name, path, file system…",
    hint: 'Search looks at every detail of a folder, including some not shown in the table, so a short word such as "ok" or "1" can match more folders than you expect.',
  },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** The clear button appears while there is text; Escape clears too. */
export const WithText: Story = {
  args: { defaultValue: "media" },
};

export const Focus: Story = {
  args: { defaultValue: "backup", autoFocus: true },
};

/** A search with the current text is running: the mark turns into a spinner. */
export const Busy: Story = {
  args: { defaultValue: "photos", busy: true },
};

/** 28px, for a table toolbar. */
export const Small: Story = {
  args: { size: "sm", defaultValue: "media", hint: undefined },
};

export const Disabled: Story = {
  args: { disabled: true, hint: "Nothing to search yet." },
};

export const LongText: Story = {
  args: {
    defaultValue:
      "/srv/dev-disk-by-uuid-0e8c4b1f-6a2d-4c3e-9f1a-5b7d2e8c9a01/media/films",
  },
};
