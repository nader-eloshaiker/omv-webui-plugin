// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { TablePagination } from "./table-pagination";

const meta = {
  title: "Components/TablePagination",
  component: TablePagination,
} satisfies Meta<typeof TablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

function Pager({
  total,
  startPage = 0,
  matching = false,
}: {
  total: number;
  startPage?: number;
  matching?: boolean;
}) {
  const [page, setPage] = React.useState(startPage);
  const [pageSize, setPageSize] = React.useState(25);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <TablePagination
      aria-label="Pages of shared folders"
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      range={`${String(first)}–${String(last)} of ${String(total)}${matching ? " matching" : ""}`}
      pageSize={pageSize}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(0);
      }}
      pageSizeLabel="Rows per page"
      previous={{
        label: "Previous page",
        unavailableReason: "This is the first page.",
      }}
      next={{ label: "Next page", unavailableReason: "This is the last page." }}
    />
  );
}

// The stories are driven, so the arguments come from the wrapper; these satisfy the type.
const args = {} as React.ComponentProps<typeof TablePagination>;

export const FirstPage: Story = { args, render: () => <Pager total={132} /> };

export const MiddlePage: Story = {
  args,
  render: () => <Pager total={132} startPage={2} />,
};

export const LastPage: Story = {
  args,
  render: () => <Pager total={132} startPage={5} />,
};

export const SinglePage: Story = {
  args,
  render: () => <Pager total={12} matching />,
};

/** Under 640px: the buttons keep their icon, with their name and a tooltip, and the bar wraps. */
export const Narrow: Story = {
  args,
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
  render: () => <Pager total={132} startPage={2} />,
};
