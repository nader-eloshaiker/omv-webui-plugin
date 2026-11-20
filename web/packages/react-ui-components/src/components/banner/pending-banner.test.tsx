// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PendingBanner, type PendingBannerProps } from "./pending-banner";

const props: PendingBannerProps = {
  label: "Pending changes",
  message: "3 pending changes: SMB, SSH, Network",
  applyLabel: "Apply 3 changes",
  undoLabel: "Undo 3 changes",
  onApply: () => undefined,
  onUndo: () => undefined,
  retryLabel: "Try applying again",
  failedMessage: "Applying the changes failed.",
  showProgress: { label: "Show progress", onShow: () => undefined },
};

describe("PendingBanner", () => {
  it("offers to try again after a failed apply, with Undo still available", () => {
    render(<PendingBanner {...props} state="failed" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Applying the changes failed.",
    );
    expect(
      screen.getByRole("button", { name: "Try applying again" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Undo 3 changes" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Show progress" }),
    ).toBeInTheDocument();
  });

  it("keeps both controls unavailable but focusable while applying", () => {
    render(<PendingBanner {...props} state="applying" />);
    for (const name of ["Apply 3 changes", "Undo 3 changes"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    expect(
      screen.getByRole("button", { name: "Show progress" }),
    ).toBeInTheDocument();
  });

  it("shows no progress control when nothing is being applied", () => {
    render(<PendingBanner {...props} />);
    expect(screen.queryByRole("button", { name: "Show progress" })).toBeNull();
  });
});
