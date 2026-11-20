// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TaskStatus } from "../status/status-kinds";
import { TaskLog } from "../task-log/task-log";
import {
  AlsoPendingNotice,
  JobFailure,
  JobRunner,
  JobStepList,
  JobSummary,
  PreflightNotice,
  type JobStep,
} from "./job-runner";

const meta = {
  title: "Patterns/Job runner",
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const STATUS_LABELS: Record<TaskStatus, string> = {
  waiting: "Waiting",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const noop = () => undefined;

function steps(
  states: TaskStatus[],
  details: Partial<Record<number, JobStep["detail"]>> = {},
): JobStep[] {
  const labels = [
    "Check that /dev/sdb is still empty",
    "Create the file system on /dev/sdb",
    "Mount the file system",
    "Create the shared folder media",
    "Share media over SMB",
    "Apply the changes",
  ];
  return labels.map((label, i) => ({
    id: `step-${String(i)}`,
    label,
    status: states[i] ?? "waiting",
    detail: details[i],
  }));
}

export const PreFlight: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <PreflightNotice
        title="Some changes are not applied yet"
        applyLabel="Apply them now"
        undoLabel="Undo them"
        onApply={noop}
        onUndo={noop}
      >
        NFS and Scheduled jobs were changed and not applied. Apply or undo them
        first, so this job applies only its own changes.
      </PreflightNotice>
    </JobRunner>
  ),
};

export const PreFlightBusy: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <PreflightNotice
        title="Some changes are not applied yet"
        applyLabel="Apply them now"
        undoLabel="Undo them"
        onApply={noop}
        onUndo={noop}
        busy
      >
        Applying NFS and Scheduled jobs...
      </PreflightNotice>
    </JobRunner>
  ),
};

export const Summary: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobSummary
        title="Ready to add the disk and share it"
        items={[
          "Erase /dev/sdb (WDC WD40EFRX, 3.6 TiB) and create an ext4 file system named data",
          "Create the shared folder media on it",
          "Share media over SMB, readable and writable by the group family",
        ]}
        alsoPending={
          <AlsoPendingNotice>
            Also pending from elsewhere: NFS
          </AlsoPendingNotice>
        }
        confirmLabel="Erase and continue..."
        backLabel="Back"
        onConfirm={noop}
        onBack={noop}
        destructive
      />
    </JobRunner>
  ),
};

export const Running: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps(["succeeded", "running"], {
          1: (
            <TaskLog
              label="Output of Create the file system"
              copyLabel="Copy output"
              copiedLabel="Output copied"
              lines={[
                "mke2fs 1.47.2 (1-Jan-2025)",
                "Creating filesystem with 976754646 4k blocks and 244195328 inodes",
                "Allocating group tables: 29809/29809 done",
              ]}
            />
          ),
        })}
      />
    </JobRunner>
  ),
};

export const Succeeded: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps([
          "succeeded",
          "succeeded",
          "succeeded",
          "succeeded",
          "succeeded",
          "succeeded",
        ])}
      />
      <p role="status" className="font-medium text-foreground">
        Done. media is shared over SMB.
      </p>
    </JobRunner>
  ),
};

export const StepFailed: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps([
          "succeeded",
          "succeeded",
          "succeeded",
          "failed",
          "cancelled",
          "cancelled",
        ])}
      />
      <JobFailure
        title="Creating the shared folder failed"
        message="The shared folder name media is already used by another shared folder."
        retryLabel="Try this step again"
        onRetry={noop}
        undo={{ label: "Undo the changes not applied yet", onUndo: noop }}
      />
    </JobRunner>
  ),
};

export const StepFailedNoUndo: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps(["succeeded", "failed"])}
      />
      <JobFailure
        title="Creating the file system failed"
        message="mkfs.ext4: Device or resource busy while setting up superblock"
        retryLabel="Try this step again"
        onRetry={noop}
      />
    </JobRunner>
  ),
};

export const ApplyFailed: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps([
          "succeeded",
          "succeeded",
          "succeeded",
          "succeeded",
          "succeeded",
          "failed",
        ])}
      />
      <JobFailure
        title="Applying the changes failed"
        message={
          "Failed to execute command 'systemctl restart smbd.service': exit code 1\nJob for smbd.service failed because the control process exited with error code."
        }
        retryLabel="Try applying again"
        onRetry={noop}
        undo={{ label: "Undo the changes instead", onUndo: noop }}
      />
    </JobRunner>
  ),
};

export const RetryRunning: Story = {
  render: () => (
    <JobFailure
      title="Applying the changes failed"
      message="Failed to execute command 'systemctl restart smbd.service': exit code 1"
      retryLabel="Try applying again"
      onRetry={noop}
      undo={{ label: "Undo the changes instead", onUndo: noop }}
      busy
    />
  ),
};
