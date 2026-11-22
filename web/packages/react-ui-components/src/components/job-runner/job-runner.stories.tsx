// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { InlineAlert } from "../inline-alert/inline-alert";
import type { TaskStatus } from "../status/status-kinds";
import { TaskLog } from "../task-log/task-log";
import { Identifier } from "../text/identifier";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  JobFailure,
  JobProgress,
  JobResult,
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
const SERVER = "Message from the server";

const LABELS: React.ReactNode[] = [
  <React.Fragment key="label-1">
    Check that <Identifier>/dev/sdb</Identifier> is still empty
  </React.Fragment>,
  <React.Fragment key="label-2">
    Create the file system on <Identifier>/dev/sdb</Identifier>
  </React.Fragment>,
  "Mount the file system",
  <React.Fragment key="label-3">
    Create the shared folder <Identifier>media</Identifier>
  </React.Fragment>,
  <React.Fragment key="label-4">
    Share <Identifier>media</Identifier> over SMB
  </React.Fragment>,
  "Apply the changes",
];

function steps(
  states: TaskStatus[],
  details: Partial<Record<number, React.ReactNode>> = {},
): JobStep[] {
  return LABELS.map((label, i) => ({
    id: `step-${String(i)}`,
    label,
    status: states[i] ?? "waiting",
    detail: details[i],
  }));
}

const RESULT_PROPS = { dismissLabel: "Dismiss the result", onDismiss: noop };

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

export const PreFlightApplying: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <PreflightNotice
        title="Some changes are not applied yet"
        applyLabel="Apply them now"
        undoLabel="Undo them"
        onApply={noop}
        onUndo={noop}
        busy="apply"
      >
        Applying the changes to NFS and Scheduled jobs…
      </PreflightNotice>
    </JobRunner>
  ),
};

export const Summary: Story = {
  render: () => (
    <JobRunner title="Share a folder">
      <JobSummary
        title="Ready to share the folder"
        items={[
          <React.Fragment key="item-1">
            Create the shared folder <Identifier>media</Identifier> on the file
            system <Identifier>data</Identifier>
          </React.Fragment>,
          "Share it over SMB, readable and writable by the group family",
        ]}
        confirmLabel="Share the folder"
        backLabel="Back"
        onConfirm={noop}
        onBack={noop}
      />
    </JobRunner>
  ),
};

// The add-shared-folder summary (phase 5 shares design 6.3), without and with guest access: the
// guest item carries the warning shape in place of its bullet, in the neutral ink.
function addFolderItems(guests: boolean) {
  return [
    <React.Fragment key="make">
      Make the shared folder <Identifier>media</Identifier> on{" "}
      <Identifier>data</Identifier>, in the folder{" "}
      <Identifier>media/</Identifier>. Only the people you give access to can
      open it.
    </React.Fragment>,
    <React.Fragment key="exists">
      If a folder called <Identifier>media/</Identifier> already exists there,
      it is used as it is, with its files and its own file permissions.
    </React.Fragment>,
    <React.Fragment key="rw">
      Read and write: <Identifier>family</Identifier>,{" "}
      <Identifier>alex</Identifier>.
    </React.Fragment>,
    <React.Fragment key="ro">
      Read only: <Identifier>guest-laptop</Identifier>.
    </React.Fragment>,
    <React.Fragment key="smb">
      Share it with Windows and Mac computers as{" "}
      <Identifier>{"\\\\NAS_HOST\\media"}</Identifier>.
    </React.Fragment>,
    ...(guests
      ? [
          {
            tone: "warning" as const,
            content:
              "Anyone on your network can open it without a password. A guest can see a folder made here but not open its files.",
          },
        ]
      : []),
    "Then apply the changes, which also applies nothing else: no other change is pending.",
  ];
}

export const SummaryAddSharedFolder: Story = {
  render: () => (
    <JobRunner title="Add a shared folder">
      <JobSummary
        title="Ready to add the shared folder"
        items={addFolderItems(false)}
        confirmLabel="Add shared folder"
        backLabel="Change choices"
        onConfirm={noop}
        onBack={noop}
      />
    </JobRunner>
  ),
};

/**
 * The summary's title as a heading (here an h3 under the job's h2) that takes focus when the step
 * opens, as the add-a-shared-folder flow does. Programmatic focus draws no ring: the reader did not
 * move it, and the heading is not a control.
 */
export const SummaryTitleAsHeading: Story = {
  render: function SummaryTitleAsHeadingStory() {
    const titleRef = React.useRef<HTMLHeadingElement>(null);
    React.useEffect(() => {
      titleRef.current?.focus();
    }, []);
    return (
      <JobRunner title="Add a shared folder">
        <JobSummary
          title="Ready to add the shared folder"
          titleLevel={3}
          titleRef={titleRef}
          items={addFolderItems(false)}
          confirmLabel="Add shared folder"
          backLabel="Change choices"
          onConfirm={noop}
          onBack={noop}
        />
      </JobRunner>
    );
  },
};

export const SummaryWithGuestAccess: Story = {
  render: () => (
    <JobRunner title="Add a shared folder">
      <JobSummary
        title="Ready to add the shared folder"
        items={addFolderItems(true)}
        confirmLabel="Add shared folder"
        backLabel="Change choices"
        onConfirm={noop}
        onBack={noop}
      />
    </JobRunner>
  ),
};

export const SummaryErasesData: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobSummary
        title="Ready to add the disk and share it"
        items={[
          <React.Fragment key="item-1">
            Erase <Identifier>/dev/sdb</Identifier> (WDC WD40EFRX, 3.6{" "}
            TiB) and create an ext4 file system named{" "}
            <Identifier>data</Identifier>
          </React.Fragment>,
          <React.Fragment key="item-2">
            Create the shared folder <Identifier>media</Identifier> on it
          </React.Fragment>,
          "Share it over SMB, readable and writable by the group family",
        ]}
        typedConfirmation={{
          confirmText: "/dev/sdb",
          prompt: "Type /dev/sdb to erase it and continue.",
        }}
        confirmLabel="Erase and continue"
        backLabel="Back"
        onConfirm={noop}
        onBack={noop}
      />
    </JobRunner>
  ),
};

/**
 * A warning that must stand apart from the list, read last before the typed field: creating a Stripe
 * array. The notice is already on screen when the step opens, so it is a note, not a live region.
 */
export const SummaryWithNotice: Story = {
  render: () => (
    <JobRunner title="Create a RAID array">
      <JobSummary
        title="Ready to create the array"
        items={[
          <React.Fragment key="item-1">
            Erase 2 disks: <Identifier>/dev/sdb</Identifier> (WDC WD40EFRX, 3.6
            TiB) and <Identifier>/dev/sdc</Identifier> (WDC WD40EFRX, 3.6 TiB)
          </React.Fragment>,
          "Combine them into a new array: Stripe (RAID0). About 7.2 TiB can be used. It cannot lose any disk. If one fails, everything on all of them is lost.",
          "Then save the array's settings, which applies the changes for it. Nothing else is pending.",
        ]}
        notice={
          <InlineAlert
            tone="neutral"
            role="note"
            title="This array has no protection"
          >
            If one disk fails, everything on all 2 disks is lost: every file on
            the array, not only the files on that disk. Keep a backup of
            anything you store on it.
          </InlineAlert>
        }
        typedConfirmation={{
          confirmText: "/dev/sdb /dev/sdc",
          prompt: "Type /dev/sdb /dev/sdc to confirm.",
        }}
        confirmLabel="Erase 2 disks and create array"
        backLabel="Change choices"
        onConfirm={noop}
        onBack={noop}
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
            <div className="flex flex-col gap-3">
              <JobProgress
                label="Creating the file system"
                elapsed="Elapsed: 1 min 42 s"
                progress={{
                  value: 29809,
                  max: 29809 * 1.6,
                  valueText: "Writing group tables: 62%",
                }}
              />
              <TaskLog
                label="Output of Create the file system"
                copyLabel="Copy output"
                copiedLabel="Output copied"
                selectedLabel="Output selected. Press Ctrl+C to copy."
                lines={[
                  "mke2fs 1.47.2 (1-Jan-2025)",
                  "Creating filesystem with 976754646 4k blocks and 244195328 inodes",
                  "Allocating group tables: 29809/29809 done",
                ]}
              />
            </div>
          ),
        })}
      />
      <JobResult {...RESULT_PROPS} />
    </JobRunner>
  ),
};

export const RunningCancellable: Story = {
  render: () => (
    <JobRunner title="Check the file system data">
      <JobProgress
        label="Checking the file system for errors"
        elapsed="Elapsed: 12 min 05 s"
        progress={{ value: null, valueText: "No progress reported" }}
        cancel={{ label: "Cancel the check", onCancel: noop }}
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
      <JobResult
        {...RESULT_PROPS}
        result={{
          status: "succeeded",
          statusLabel: "Succeeded",
          message: (
            <>
              The shared folder <Identifier>media</Identifier> is shared over
              SMB.
            </>
          ),
        }}
      />
    </JobRunner>
  ),
};

export const CancelledByUser: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps(["succeeded", "cancelled"])}
      />
      <JobResult
        {...RESULT_PROPS}
        result={{
          status: "cancelled",
          statusLabel: "Cancelled",
          message:
            "You cancelled the job while the file system was being created. The disk was erased; 4 steps did not run.",
        }}
      />
    </JobRunner>
  ),
};

const MOUNT_ERROR =
  "mount: /srv/dev-disk-by-uuid-0b9f6c2e: wrong fs type, bad option, bad superblock on /dev/sdb1, missing codepage or helper program, or other error.";

export const StepFailed: Story = {
  render: () => (
    <JobRunner title="Add storage and share it">
      <JobStepList
        label="Steps"
        statusLabels={STATUS_LABELS}
        steps={steps(["succeeded", "succeeded", "failed"])}
      />
      <JobFailure
        title="Mounting the file system failed"
        message="The new file system was created but could not be mounted. Nothing has been shared yet."
        notRun="3 steps did not run."
        serverMessage={{ label: SERVER, text: MOUNT_ERROR }}
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
        steps={steps(["succeeded", "succeeded", "failed"])}
      />
      <JobFailure
        title="Mounting the file system failed"
        message="The new file system was created but could not be mounted. Undo is not offered: the pending changes include work from before this job."
        notRun="3 steps did not run."
        serverMessage={{ label: SERVER, text: MOUNT_ERROR }}
        retryLabel="Try this step again"
        onRetry={noop}
      />
    </JobRunner>
  ),
};

export const PausedBeforeApply: Story = {
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
          "waiting",
        ])}
      />
      <AlsoPendingPrompt
        title="Other changes are pending too"
        applyLabel="Apply them too"
        stopLabel="Stop here"
        onApply={noop}
        onStop={noop}
      >
        <AlsoPendingNotice>Also pending from elsewhere: NFS</AlsoPendingNotice>
        <p>
          Someone changed NFS while this job ran. Applying now applies that
          change as well. Stop here to leave everything pending and look at it
          first.
        </p>
      </AlsoPendingPrompt>
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
        message="The SMB service could not be restarted, so the share is not available yet. The changes are still pending."
        serverMessage={{
          label: SERVER,
          text: "Failed to execute command 'systemctl restart smbd.service': exit code 1\nJob for smbd.service failed because the control process exited with error code.",
        }}
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
      message="The SMB service could not be restarted, so the share is not available yet."
      retryLabel="Try applying again"
      onRetry={noop}
      undo={{ label: "Undo the changes instead", onUndo: noop }}
      busy="retry"
    />
  ),
};
