// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
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
    <div className="flex flex-wrap gap-2 p-6">
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
            tone: "ok",
            title: "Updates installed",
            description: "3 packages upgraded.",
            action: { label: "Show task", onClick: () => undefined },
          })
        }
      >
        Result with an action
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            tone: "warning",
            title: "Scrub finished with warnings",
            description: "2 checksum errors were corrected on pool tank.",
          })
        }
      >
        Warning
      </Button>
      <Button
        variant="neutral"
        onClick={() =>
          toast.show({
            tone: "critical",
            title: "Backup job nightly failed",
            description: "The task log has the details.",
          })
        }
      >
        Critical (assertive, stays)
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
      tone: "critical",
      title: "Backup job nightly failed",
      description: "The task log has the details.",
      action: { label: "Show task", onClick: () => undefined },
    });
  }, [toast]);
  return (
    <p className="p-6 text-muted-foreground">Toasts appear at the bottom.</p>
  );
}

export const Kinds: Story = { render: () => <Triggers /> };
export const Showing: Story = { render: () => <Shown /> };
