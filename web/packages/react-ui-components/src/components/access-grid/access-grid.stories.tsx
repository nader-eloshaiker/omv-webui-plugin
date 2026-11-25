// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { ExternalLink } from "../external-link/external-link";
import { StatusLabel } from "../status/status";
import {
  AccessGrid,
  type AccessGridProps,
  type AccessGridRow,
} from "./access-grid";

type Access = "rw" | "ro" | "none" | "blocked";

const OPTIONS = [
  { value: "rw", label: "Read and write" },
  { value: "ro", label: "Read only" },
  { value: "none", label: "No access" },
  { value: "blocked", label: "Blocked" },
] as const;

const WORDS: Record<Access, string> = {
  rw: "Read and write",
  ro: "Read only",
  none: "No access",
  blocked: "Blocked",
};

const LABELS: Omit<
  AccessGridProps<Access>,
  "rows" | "onChange" | "onSetAll"
> = {
  "aria-label": "Who can use media",
  columns: { name: "Name", kind: "Kind", access: "Access" },
  options: OPTIONS,
  normalValues: ["rw", "ro", "none"],
  accessValues: ["rw", "ro"],
  rowLabel: (name) => `Access for ${name}`,
  changedLabel: "Changed",
  search: {
    label: "Search people and groups",
    clearLabel: "Clear the search",
  },
  show: {
    label: "Show",
    all: "Everyone",
    withAccess: "With access",
    changed: "Changed",
  },
  setAll: {
    label: "Set all shown to",
    applyLabel: (count) => `Apply to ${count.toLocaleString("en")} shown`,
  },
  countText: (shown, total) =>
    `${shown.toLocaleString("en")} of ${total.toLocaleString("en")} people and groups.`,
  filteredEmpty: {
    message: (search) =>
      search === ""
        ? "No people or groups match this filter."
        : `No people or groups match "${search}".`,
    clearLabel: "Clear the search",
  },
  pagination: {
    "aria-label": "Pages of people and groups",
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
      "There are no user accounts on this NAS yet, apart from the administrator. Add the people who will use shared folders, then give them access here.",
    action: (
      <ExternalLink href="/#/usermgmt/users" newTabLabel="(opens in a new tab)">
        Users in the classic interface
      </ExternalLink>
    ),
  },
};

function group(name: string, value: Access): AccessGridRow<Access> {
  return {
    id: `group:${name}`,
    name,
    kind: "Group",
    value,
    initialValue: value,
  };
}

function person(
  name: string,
  value: Access,
  extra: Partial<AccessGridRow<Access>> = {},
): AccessGridRow<Access> {
  return {
    id: `user:${name}`,
    name,
    kind: "User",
    value,
    initialValue: value,
    ...extra,
  };
}

const viaFamily = `Also gets ${WORDS.rw} as a member of family.`;

const HOUSEHOLD: readonly AccessGridRow<Access>[] = [
  group("family", "rw"),
  group("kids", "ro"),
  person("alex", "none", { description: "Alex Smith", notes: [viaFamily] }),
  person("jordan", "rw", { description: "Jordan Smith" }),
  person("media-player", "ro", { description: "Living room TV" }),
  person("old-laptop", "blocked", {
    allowedValues: ["rw", "ro", "none", "blocked"],
    notes: ["Blocked: cannot open it, even through family."],
  }),
  person("sam", "none", { notes: [viaFamily] }),
];

/** Holds every row's value, as the app does, so the story can be used. */
function Live({
  rows,
  edits = {},
  ...props
}: Partial<AccessGridProps<Access>> & {
  rows: readonly AccessGridRow<Access>[];
  edits?: Record<string, Access>;
}) {
  const [values, setValues] = React.useState<Record<string, Access>>(edits);
  return (
    <AccessGrid<Access>
      {...LABELS}
      {...props}
      rows={rows.map((row) => ({ ...row, value: values[row.id] ?? row.value }))}
      onChange={(id, value) =>
        setValues((before) => ({ ...before, [id]: value }))
      }
      onSetAll={(ids, value) =>
        setValues((before) => ({
          ...before,
          ...Object.fromEntries(ids.map((id) => [id, value])),
        }))
      }
    />
  );
}

const meta = {
  title: "Patterns/Access grid",
  decorators: [(Story) => <div className="max-w-4xl">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Groups first, then people. Tab moves row to row; the arrows change a row. */
export const Populated: Story = {
  render: () => <Live rows={HOUSEHOLD} />,
};

export const ChangedRows: Story = {
  render: () => (
    <Live
      rows={HOUSEHOLD}
      edits={{ "group:kids": "none", "user:alex": "rw", "user:sam": "ro" }}
    />
  ),
};

export const ChangedFilter: Story = {
  render: () => (
    <Live
      rows={HOUSEHOLD}
      edits={{ "group:kids": "none", "user:alex": "rw" }}
      defaultShow="changed"
    />
  ),
};

export const UnavailableRow: Story = {
  render: () => (
    <Live
      rows={[
        ...HOUSEHOLD.slice(0, 3),
        person("admin", "none", {
          unavailableReason:
            "The web interface's administrator account cannot be given access to shared folders.",
        }),
        ...HOUSEHOLD.slice(3),
      ]}
    />
  ),
};

export const Saving: Story = {
  render: () => (
    <Live
      rows={HOUSEHOLD}
      edits={{ "user:alex": "rw" }}
      saving={{ label: "Saving…" }}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <Live rows={[]} loading={{ label: "Loading people and groups…" }} />
  ),
};

export const ReadFailed: Story = {
  render: () => (
    <Live
      rows={[]}
      error={{
        message: "Could not read the people and groups on this NAS.",
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

export const Empty: Story = {
  render: () => <Live rows={[]} />,
};

export const FilteredEmpty: Story = {
  render: () => <Live rows={HOUSEHOLD} defaultSearch="zz-nobody" />,
};

export const OneRow: Story = {
  render: () => <Live rows={[person("alex", "rw")]} />,
};

/** 1,000 accounts (the UX audit's probe): paged in the browser at 50, searched across all. */
export const AThousandRows: Story = {
  render: () => (
    <Live
      rows={[
        group("family", "rw"),
        group("staff", "ro"),
        ...Array.from({ length: 998 }, (_, i) =>
          person(
            `user${String(i + 1).padStart(4, "0")}`,
            i % 7 === 0 ? "ro" : "none",
            i % 5 === 0 ? { description: `Desk ${String(i + 1)}` } : {},
          ),
        ),
      ]}
    />
  ),
};

export const LongAndRightToLeftNames: Story = {
  render: () => (
    <Live
      rows={[
        group(
          "photography-club-members-and-friends-of-the-darkroom-2026",
          "ro",
        ),
        person("سارة", "rw", { description: "سارة الأحمد، غرفة المعيشة" }),
        person("יונתן", "none", { notes: [viaFamily] }),
        person(
          "a-very-long-account-name-for-the-backup-service-that-never-ends",
          "rw",
          {
            description:
              "Used by the backup software on the office desktop to copy the photo library every night at two in the morning.",
          },
        ),
        person('<img src=x onerror="alert(1)">', "none"),
      ]}
    />
  ),
};

/** Translated words about 40% longer: the choice stacks where it does not fit. */
export const LongerWords: Story = {
  render: () => (
    <Live
      rows={HOUSEHOLD.slice(0, 4)}
      options={[
        { value: "rw", label: "Lesen und Schreiben erlaubt" },
        { value: "ro", label: "Nur Lesen erlaubt" },
        { value: "none", label: "Kein Zugriff möglich" },
        { value: "blocked", label: "Gesperrt" },
      ]}
    />
  ),
};

/** 320px: Name and Kind share a line, the choice moves under them, nothing scrolls sideways. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-[18rem]">{Story()}</div>],
  render: () => <Live rows={HOUSEHOLD} edits={{ "user:alex": "rw" }} />,
};

// A person's page (phase 5 users design 4.2): the same grid with shared folders as rows, each name a
// link to the folder's page. The app passes its router link; a plain anchor stands in for it here.
const FOLDER_WORDS: Partial<AccessGridProps<Access>> = {
  "aria-label": "Shared folders alex may open",
  columns: { name: "Name", kind: "Sharing", access: "Access" },
  rowLabel: (name) => `Access to ${name}`,
  search: { label: "Search shared folders", clearLabel: "Clear the search" },
  show: {
    label: "Show",
    all: "All folders",
    withAccess: "With access",
    changed: "Changed",
  },
  countText: (shown, total) =>
    `${shown.toLocaleString("en")} of ${total.toLocaleString("en")} shared folders.`,
};

function folder(
  name: string,
  value: Access,
  kind: React.ReactNode,
  extra: Partial<AccessGridRow<Access>> = {},
): AccessGridRow<Access> {
  return {
    id: `folder:${name}`,
    name,
    kind,
    value,
    initialValue: value,
    nameLink: {
      "aria-label": `Open shared folder ${name}`,
      render: (props) => (
        <a
          href={`#/storage/shared-folders/${encodeURIComponent(name)}`}
          {...props}
        />
      ),
    },
    ...extra,
  };
}

const FOLDERS: readonly AccessGridRow<Access>[] = [
  folder("Music", "ro", "Windows and Mac", {
    description: "The family music library",
    notes: [`Also gets ${WORDS.rw} as a member of family.`],
  }),
  folder("Photos", "rw", "Windows and Mac", {
    description: "Every photo since 2009",
  }),
  folder(
    "old-backups",
    "none",
    <>
      <StatusLabel status="critical">Missing</StatusLabel>
      <span>Its disk is not connected.</span>
    </>,
  ),
  folder("scans", "none", "Windows and Mac (off)"),
  folder("public", "ro", "Guests too", {
    notes: ["Anyone on your network can open it, without a password."],
  }),
  folder("work", "none", "Not shared"),
];

/** Folders as rows: each name a link to its page, named "Open shared folder …". */
export const FoldersAsRowsWithLinks: Story = {
  render: () => <Live {...FOLDER_WORDS} rows={FOLDERS} />,
};

/** A folder that is not OK shows its status label and status words in the Kind column instead. */
export const PillInTheKindColumn: Story = {
  render: () => (
    <Live
      {...FOLDER_WORDS}
      rows={[
        ...FOLDERS.slice(1, 3),
        folder(
          "archive",
          "ro",
          <>
            <StatusLabel status="warning">Degraded</StatusLabel>
            <span>Windows and Mac</span>
          </>,
        ),
        folder(
          "tv-recordings",
          "none",
          <StatusLabel status="unknown">Not known</StatusLabel>,
        ),
      ]}
    />
  ),
};

/**
 * After "Save access": Photos was refused by the last-access check, so it is not written; its row
 * keeps the change, says why, and stays editable. Music was saved.
 */
export const RowRefusedAfterSave: Story = {
  render: () => (
    <Live
      {...FOLDER_WORDS}
      rows={FOLDERS.map((row) =>
        row.id === "folder:Photos"
          ? {
              ...row,
              refusal:
                "alex is the only one with access to Photos, which is shared with Windows and Mac computers. Give someone else access on its page, or stop sharing it, first.",
            }
          : row,
      )}
      edits={{ "folder:Photos": "none" }}
    />
  ),
};

/** 320px: the status and its words wrap in their column beside the name; nothing scrolls sideways. */
export const FoldersNarrow: Story = {
  decorators: [(Story) => <div className="w-[18rem]">{Story()}</div>],
  render: () => (
    <Live
      {...FOLDER_WORDS}
      rows={FOLDERS.map((row) =>
        row.id === "folder:Photos"
          ? {
              ...row,
              refusal:
                "alex is the only one with access to Photos, which is shared with Windows and Mac computers. Give someone else access on its page, or stop sharing it, first.",
            }
          : row,
      )}
      edits={{ "folder:Photos": "none" }}
    />
  ),
};
