// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { buttonRowClass } from "../button/button-class";
import { useToast } from "./use-toast";

const meta = {
  title: "Components/Toast",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Triggers() {
  const toast = useToast();
  return (
    <div className={`p-6 ${buttonRowClass}`}>
      <Button
        variant="neutral"
        onClick={() => toast.show({ title: "Shared folder media saved" })}
      >
        Confirmation (dismisses itself)
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            tone: "succeeded",
            statusLabel: "Succeeded",
            title: "Install updates",
            description: "3 packages upgraded.",
            action: { label: "Show task", onClick: () => undefined },
          })
        }
      >
        Task succeeded, with an action
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            tone: "failed",
            statusLabel: "Failed",
            title: "Backup job nightly",
            description: "The task log has the details.",
            action: { label: "Show task", onClick: () => undefined },
          })
        }
      >
        Task failed (assertive, stays)
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            tone: "warning",
            statusLabel: "Warning",
            title: "Pool tank: scrub found 2 errors",
            description: "Both were corrected.",
          })
        }
      >
        Warning about a monitored thing
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            title: '<img src=x onerror="alert(1)"> renders as text',
          })
        }
      >
        Markup-looking text
      </Button>
    </div>
  );
}

function Shown() {
  const toast = useToast();
  const shownRef = React.useRef(false);
  React.useEffect(() => {
    if (shownRef.current) {
      return;
    }
    shownRef.current = true;
    toast.show({ title: "Shared folder media saved" });
    toast.show({
      tone: "failed",
      statusLabel: "Failed",
      title: "Backup job nightly",
      description: "The task log has the details.",
      action: { label: "Show task", onClick: () => undefined },
    });
  }, [toast]);
  return (
    <p className="p-6 text-muted-foreground">
      Toasts appear bottom-end, or under the top bar on a narrow screen.
    </p>
  );
}

export const Kinds: Story = { render: () => <Triggers /> };
export const Showing: Story = { render: () => <Shown /> };
