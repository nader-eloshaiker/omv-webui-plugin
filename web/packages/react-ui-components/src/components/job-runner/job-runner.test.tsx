// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskStatus } from "../status/status-kinds";
import {
  JobProgress,
  JobResult,
  JobStepList,
  JobSummary,
  type JobStep,
} from "./job-runner";

const WORDS: Record<TaskStatus, string> = {
  waiting: "Waiting",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const steps = (a: TaskStatus, b: TaskStatus): JobStep[] => [
  { id: "1", label: "Create the file system", status: a },
  { id: "2", label: "Mount the file system", status: b },
];

describe("JobStepList", () => {
  it("has its live region from the first render and announces a step that changes", () => {
    const { container, rerender } = render(
      <JobStepList
        label="Steps"
        statusLabels={WORDS}
        steps={steps("running", "waiting")}
      />,
    );
    const announcer = container.querySelector("[data-slot=job-step-announcer]");
    expect(announcer).toHaveAttribute("role", "status");
    expect(announcer).toHaveTextContent("");
    rerender(
      <JobStepList
        label="Steps"
        statusLabels={WORDS}
        steps={steps("succeeded", "running")}
      />,
    );
    expect(announcer).toHaveTextContent("Mount the file system Running");
  });
});

describe("JobResult", () => {
  it("renders its live region before there is a result, and keeps the result until dismissed", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <JobResult dismissLabel="Dismiss the result" onDismiss={onDismiss} />,
    );
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <JobResult
        dismissLabel="Dismiss the result"
        onDismiss={onDismiss}
        result={{
          status: "failed",
          statusLabel: "Failed",
          message: "Mounting failed.",
        }}
      />,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Failed");
    await user.click(
      screen.getByRole("button", { name: "Dismiss the result" }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("JobSummary with a typed confirmation", () => {
  it("keeps the red confirm unavailable until the name matches", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <JobSummary
        title="Ready"
        items={["Erase /dev/sdb"]}
        typedConfirmation={{
          confirmText: "/dev/sdb",
          prompt: "Type /dev/sdb to continue.",
        }}
        confirmLabel="Erase and continue"
        backLabel="Back"
        onConfirm={onConfirm}
        onBack={() => undefined}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Erase and continue" });
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole("textbox", { name: "Type /dev/sdb to continue." }),
      "/dev/sdb",
    );
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("JobProgress", () => {
  it("draws its progress as a ProgressBar named by the step, with the figures as text", () => {
    render(
      <JobProgress
        label="Creating the file system"
        elapsed="Elapsed: 1 min 42 s"
        progress={{
          value: 31,
          max: 50,
          valueText: "Writing group tables: 62%",
        }}
      />,
    );
    const bar = screen.getByRole("progressbar", {
      name: "Creating the file system",
    });
    expect(bar).toHaveAttribute("data-slot", "progress-bar");
    expect(bar).toHaveAttribute("aria-valuemax", "50");
    expect(bar).toHaveAttribute("aria-valuetext", "Writing group tables: 62%");
    expect(screen.getByText("Writing group tables: 62%")).toBeVisible();
  });

  it("shows the label without a bar when the task reports no progress", () => {
    render(<JobProgress label="Applying the changes" elapsed="Elapsed: 4 s" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Applying the changes")).toBeVisible();
  });
});

describe("JobSummary with a notice", () => {
  it("renders the notice after the list and before the typed confirmation", () => {
    render(
      <JobSummary
        title="Ready to create the array"
        items={["Erase 2 disks", "Combine them into a new array"]}
        notice={<div role="note">This array has no protection</div>}
        typedConfirmation={{
          confirmText: "/dev/sdb /dev/sdc",
          prompt: "Type /dev/sdb /dev/sdc to confirm.",
        }}
        confirmLabel="Erase 2 disks and create array"
        backLabel="Change choices"
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );
    const list = screen.getByRole("list");
    const notice = screen.getByRole("note");
    const field = screen.getByRole("textbox", {
      name: "Type /dev/sdb /dev/sdc to confirm.",
    });
    expect(
      list.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      notice.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(list).not.toContainElement(notice);
  });
});
