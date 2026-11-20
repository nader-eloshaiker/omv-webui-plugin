// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskStatus } from "../status/status-kinds";
import { JobResult, JobStepList, JobSummary, type JobStep } from "./job-runner";

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
