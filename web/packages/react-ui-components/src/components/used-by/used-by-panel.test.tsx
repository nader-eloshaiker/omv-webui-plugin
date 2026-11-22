// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsedByPanel } from "./used-by-panel";

const base = {
  title: "Used by",
  emptyText: "Nothing uses this shared folder.",
  referrers: [],
};

describe("UsedByPanel", () => {
  it("never says nothing uses it when it could not check", () => {
    render(
      <UsedByPanel
        {...base}
        error={{
          message: "Could not check whether anything uses this shared folder.",
          retryLabel: "Check again",
          onRetry: () => undefined,
        }}
      />,
    );
    expect(screen.queryByText(base.emptyText)).toBeNull();
    expect(screen.queryByText(/can be deleted/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
  });

  it("never says nothing uses it while it is still checking", () => {
    render(<UsedByPanel {...base} loading={{ label: "Checking…" }} />);
    expect(screen.queryByText(base.emptyText)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Checking…");
  });

  it("names the blocker beside the unavailable control", () => {
    render(
      <UsedByPanel
        {...base}
        referrers={[{ id: "1", kind: "SMB share", name: "media" }]}
        blockedAction={{
          label: "Delete shared folder",
          reason: "Remove the share first.",
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Delete shared folder" }),
    ).toHaveAccessibleDescription("Remove the share first.");
  });

  it("uses the heading level the page asks for", () => {
    render(<UsedByPanel {...base} headingLevel={2} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Used by" }),
    ).toBeInTheDocument();
  });
  it("shows a referrer with no action as a named entry with what it is and no control", () => {
    render(
      <UsedByPanel
        {...base}
        referrers={[
          {
            id: "smb-media",
            kind: "Shared with Windows and Mac computers.",
            name: "media",
          },
        ]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent(
      "Shared with Windows and Mac computers.media",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(base.emptyText)).toBeNull();
  });

  it("says an unknown use in words alone when no link is given", () => {
    render(
      <UsedByPanel
        {...base}
        unknownUse={{
          message: "Used by a setting this page does not show.",
        }}
      />,
    );
    expect(
      screen.getByText("Used by a setting this page does not show."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(base.emptyText)).toBeNull();
  });
});
