// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import {
  MemberPicker,
  type MemberPickerProps,
  type MemberPickerRow,
} from "./member-picker";

const GROUP_WORDS: Omit<MemberPickerProps, "rows" | "value" | "onChange"> = {
  legend: "Groups",
  hint: "A group is a set of people who get the same access to shared folders. Groups give no other powers on the NAS.",
  changedLabel: "Changed",
  search: { label: "Search groups", clearLabel: "Clear the search" },
  show: { label: "Show", all: "All groups", ticked: "Groups alex is in" },
  countText: (count, total) =>
    `In ${count.toLocaleString("en")} of ${total.toLocaleString("en")} groups.`,
  filteredEmpty: {
    message: (search) =>
      search === ""
        ? "alex is in no group yet."
        : `No groups match "${search}".`,
    clearLabel: "Clear the search",
  },
  pagination: {
    "aria-label": "Pages of groups",
    pageSizeLabel: "Rows per page",
    previous: {
      label: "Previous page",
      unavailableReason: "This is the first page.",
    },
    next: { label: "Next page", unavailableReason: "This is the last page." },
    range: (first, last, shown) =>
      `${first.toLocaleString("en")}–${last.toLocaleString("en")} of ${shown.toLocaleString("en")}`,
  },
  empty: {
    message:
      "There are no groups yet. A group is a set of people who get the same access to shared folders.",
    action: (
      <a
        href="#/usermgmt/groups/add"
        className="rounded-sm text-link underline underline-offset-2 hover:no-underline"
      >
        Add a group
      </a>
    ),
  },
};

const MEMBER_WORDS: Omit<MemberPickerProps, "rows" | "value" | "onChange"> = {
  ...GROUP_WORDS,
  legend: "Members",
  hint: "Everyone in family gets the access the group has to shared folders.",
  search: { label: "Search people", clearLabel: "Clear the search" },
  show: { label: "Show", all: "Everyone", ticked: "Members" },
  countText: (count, total) =>
    `${count.toLocaleString("en")} of ${total.toLocaleString("en")} people are members.`,
  filteredEmpty: {
    message: (search) =>
      search === ""
        ? "family has no members yet."
        : `No people match "${search}".`,
    clearLabel: "Clear the search",
  },
  pagination: { ...GROUP_WORDS.pagination, "aria-label": "Pages of people" },
  empty: {
    message:
      "There are no people on this NAS yet, apart from the administrator.",
  },
};

const HOUSEHOLD_GROUPS: readonly MemberPickerRow[] = [
  { id: "family", name: "family", description: "Everyone who lives here" },
  { id: "kids", name: "kids", description: "Read-only access to the media" },
  { id: "photography", name: "photography" },
  {
    id: "users",
    name: "users",
    description: "Every person on this NAS",
    unavailableReason: "Everyone is in users. It cannot be taken away here.",
  },
];

const MANY_GROUPS: readonly MemberPickerRow[] = [
  ...HOUSEHOLD_GROUPS,
  {
    id: "backup",
    name: "backup",
    description: "Accounts the backup software uses",
  },
  { id: "guests", name: "guests", description: "Friends staying over" },
  { id: "media", name: "media" },
  { id: "music", name: "music", description: "Edit the music library" },
  { id: "office", name: "office", description: "The home office laptops" },
  { id: "scanners", name: "scanners", description: "The scanner in the hall" },
  { id: "video", name: "video" },
  { id: "work", name: "work", description: "Client files, not for the kids" },
];

const PEOPLE: readonly MemberPickerRow[] = [
  { id: "alex", name: "alex", description: "Alex Smith" },
  { id: "jordan", name: "jordan", description: "Jordan Smith" },
  {
    id: "media-player",
    name: "media-player",
    description: "Living room TV",
  },
  {
    id: "sam",
    name: "sam",
    description: "Sam Smith",
    unavailableReason: "This is sam's main group, set outside this interface.",
  },
];

/** Holds the ticked ids, as the app does, so the story can be used. */
function Live({
  rows,
  initial,
  edits,
  words = GROUP_WORDS,
  ...props
}: Partial<Omit<MemberPickerProps, "value" | "initialValue" | "rows">> & {
  rows: readonly MemberPickerRow[];
  initial: readonly string[];
  /** The ticks as the reader left them, when they differ from the saved ones. */
  edits?: readonly string[];
  words?: typeof GROUP_WORDS;
}) {
  const [value, setValue] = React.useState<readonly string[]>(edits ?? initial);
  return (
    <MemberPicker
      {...words}
      {...props}
      rows={rows}
      value={value}
      initialValue={initial}
      onChange={setValue}
    />
  );
}

const meta = {
  title: "Patterns/Member picker",
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ten rows or fewer: no search or filter. Tab moves box to box; Space ticks. */
export const Populated: Story = {
  render: () => <Live rows={HOUSEHOLD_GROUPS} initial={["family", "users"]} />,
};

/** More than ten rows: the search and the "Show" filter come first. */
export const WithSearchAndFilter: Story = {
  render: () => (
    <Live rows={MANY_GROUPS} initial={["family", "users", "music"]} />
  ),
};

export const TickedFilter: Story = {
  render: () => (
    <Live
      rows={MANY_GROUPS}
      initial={["family", "users", "music"]}
      defaultShow="ticked"
    />
  ),
};

export const ChangedRows: Story = {
  render: () => (
    <Live
      rows={HOUSEHOLD_GROUPS}
      initial={["family", "users"]}
      edits={["users", "kids", "photography"]}
    />
  ),
};

/** A group's members: the person whose main group this is stays ticked, with the reason. */
export const MembersOfAGroup: Story = {
  render: () => (
    <Live rows={PEOPLE} initial={["alex", "sam"]} words={MEMBER_WORDS} />
  ),
};

/** Every box unavailable, but still focusable; the caller's "Save groups" shows "Saving…". */
export const Saving: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Live
        rows={HOUSEHOLD_GROUPS}
        initial={["family", "users"]}
        edits={["users", "kids"]}
        saving={{ label: "Saving…" }}
      />
      <div className="flex gap-2">
        <Button loading>Saving…</Button>
      </div>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <Live rows={[]} initial={[]} loading={{ label: "Loading groups…" }} />
  ),
};

export const ReadFailed: Story = {
  render: () => (
    <Live
      rows={[]}
      initial={[]}
      error={{
        message: "Could not read the groups.",
        serverMessage: {
          label: "Message from the server",
          text: "Failed to execute command 'getent group': exit code 2",
        },
        retryLabel: "Try again",
        onRetry: () => undefined,
      }}
    />
  ),
};

/** No rows at all, with the caller's router link. */
export const Empty: Story = {
  render: () => <Live rows={[]} initial={[]} />,
};

export const FilteredEmpty: Story = {
  render: () => (
    <Live rows={MANY_GROUPS} initial={["family"]} defaultSearch="zz-nothing" />
  ),
};

export const OneRow: Story = {
  render: () => <Live rows={[{ id: "family", name: "family" }]} initial={[]} />,
};

/** 1,000 people (the UX audit's probe): paged in the browser at 50, searched across all. */
export const AThousandRows: Story = {
  render: () => (
    <Live
      words={MEMBER_WORDS}
      rows={Array.from({ length: 1000 }, (_, i) => {
        const name = `user${String(i + 1).padStart(4, "0")}`;
        return {
          id: name,
          name,
          description: i % 5 === 0 ? `Desk ${String(i + 1)}` : undefined,
        };
      })}
      initial={["user0001", "user0042", "user0777"]}
    />
  ),
};

export const LongAndRightToLeftNames: Story = {
  render: () => (
    <Live
      rows={[
        {
          id: "long",
          name: "photography-club-members-and-friends-of-the-darkroom-2026",
          description:
            "Everyone who brings film to the Thursday evening darkroom session, and the friends they invite along.",
        },
        { id: "sara", name: "سارة", description: "سارة الأحمد، غرفة المعيشة" },
        { id: "yonatan", name: "יונתן" },
        {
          id: "markup",
          name: '<img src=x onerror="alert(1)">',
          description: "<b>Not bold</b>",
        },
      ]}
      initial={["sara"]}
    />
  ),
};

/** Translated words about 40% longer: the filter and the count wrap. */
export const LongerWords: Story = {
  render: () => (
    <Live
      rows={MANY_GROUPS}
      initial={["family"]}
      words={{
        ...GROUP_WORDS,
        search: {
          label: "Gruppen nach Name oder Beschreibung durchsuchen",
          clearLabel: "Suche leeren",
        },
        show: {
          label: "Anzeigen",
          all: "Alle vorhandenen Gruppen",
          ticked: "Gruppen, in denen alex Mitglied ist",
        },
        changedLabel: "Geändert",
        countText: (count, total) =>
          `Mitglied in ${String(count)} von ${String(total)} vorhandenen Gruppen.`,
      }}
      edits={["family", "kids"]}
    />
  ),
};

/** 320px: the search takes the full width, names and descriptions wrap, nothing scrolls sideways. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-[18rem]">{Story()}</div>],
  render: () => (
    <Live
      rows={[
        ...MANY_GROUPS,
        {
          id: "long",
          name: "photography-club-members-and-friends-of-the-darkroom-2026",
        },
      ]}
      initial={["family", "users"]}
      edits={["users", "kids"]}
    />
  ),
};

/**
 * At 200% zoom the tools stack, the count line and the descriptions wrap; view this story with the
 * browser zoomed to check.
 */
export const Zoom200Note: Story = {
  render: () => (
    <Live
      rows={MANY_GROUPS}
      initial={["family", "users"]}
      edits={["users", "kids"]}
    />
  ),
};
