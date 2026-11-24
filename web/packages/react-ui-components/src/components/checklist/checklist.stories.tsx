// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../card/card";
import { ExternalLink } from "../external-link/external-link";
import { Identifier } from "../text/identifier";
import { Checklist, ChecklistItem } from "./checklist";

const meta = {
  title: "Patterns/Checklist",
  component: ChecklistItem,
  decorators: [(Story) => <div className="max-w-3xl">{Story()}</div>],
} satisfies Meta<typeof ChecklistItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const NEW_TAB = "(opens in a new tab)";
const args = {
  state: "done",
  title: "",
} as const satisfies React.ComponentProps<typeof ChecklistItem>;

/** Every state, in the fixed order of the set-up checklist. Shape and word tell them apart. */
export const SetUpYourNas: Story = {
  args,
  render: function SetUpYourNasStory() {
    const storyId = React.useId();
    return (
      <Card render={<section aria-labelledby={`${storyId}-setup-title`} />}>
        <CardHeader>
          <CardTitle id={`${storyId}-setup-title`}>Set up your NAS</CardTitle>
          <CardDescription>
            A few things to check after installing. Each item is read from the
            NAS&apos;s current settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Checklist>
            <ChecklistItem
              state="notChecked"
              stateLabel="Not checked"
              title="Change the factory password"
              action={
                <a
                  href="#password"
                  className="text-action-label underline underline-offset-2 hover:no-underline"
                >
                  Change your password
                </a>
              }
            >
              <p>
                openmediavault is installed with a password that anyone can look
                up. If it has not been changed yet, change it now. This page
                cannot check whether it has been.
              </p>
            </ChecklistItem>
            <ChecklistItem
              state="done"
              stateLabel="Done"
              title="Use a secure connection (HTTPS)"
            >
              <p>HTTPS is on.</p>
            </ChecklistItem>
            <ChecklistItem
              state="notDone"
              stateLabel="Not done"
              title="Get email alerts"
              action={
                <ExternalLink
                  href="/#/system/notification/settings"
                  newTabLabel={NEW_TAB}
                >
                  Open Notifications in the classic interface
                </ExternalLink>
              }
            >
              <p>
                Alerts are off. Turn them on to hear about failing disks, full
                file systems and available updates. You need the details of an
                email account the NAS can send from.
              </p>
              <p>
                After saving there, apply the changes, then send a test email.
              </p>
            </ChecklistItem>
            <ChecklistItem
              state="notDone"
              stateLabel="Not done"
              title="Install updates"
              action={
                <ExternalLink
                  href="/#/system/updatemgmt/updates"
                  newTabLabel={NEW_TAB}
                >
                  Open Updates in the classic interface
                </ExternalLink>
              }
            >
              <p>3 updates are available.</p>
            </ChecklistItem>
            <ChecklistItem
              state="value"
              title="Name of your NAS"
              action={
                <ExternalLink href="/#/network/general" newTabLabel={NEW_TAB}>
                  Change it in the classic interface
                </ExternalLink>
              }
            >
              <p>
                Your NAS is called <Identifier>nas01</Identifier>. Other
                computers on your network find it by this name.
              </p>
            </ChecklistItem>
            <ChecklistItem
              state="checking"
              stateLabel="Checking…"
              title="Time zone"
            />
          </Checklist>
        </CardContent>
        <CardFooter>
          <Button variant="neutral">Hide the checklist</Button>
          <span className="text-sm text-muted-foreground">
            Hides it for every administrator, and hides the classic
            interface&apos;s welcome panel too.
          </span>
        </CardFooter>
      </Card>
    );
  },
};

export const Done: Story = {
  args: {
    state: "done",
    stateLabel: "Done",
    title: "Get email alerts",
    children: <p>Alerts go to admin@example.com.</p>,
  },
  render: (props) => (
    <Checklist>
      <ChecklistItem {...props} />
    </Checklist>
  ),
};

export const NotDone: Story = {
  args: {
    state: "notDone",
    stateLabel: "Not done",
    title: "Use a secure connection (HTTPS)",
    children: (
      <p>
        HTTPS is off. The notice at the top of the page says why that matters.
        Turning it on needs a certificate, which the classic interface can
        create.
      </p>
    ),
    action: (
      <ExternalLink href="/#/system/workbench/settings" newTabLabel={NEW_TAB}>
        Open Web interface settings in the classic interface
      </ExternalLink>
    ),
  },
  render: Done.render,
};

export const NotChecked: Story = {
  args: {
    state: "notChecked",
    stateLabel: "Not checked",
    title: "Install updates",
    children: (
      <p>
        No updates were found the last time the NAS looked. This page cannot
        tell when that was, so check for updates once to be sure.
      </p>
    ),
  },
  render: Done.render,
};

export const Value: Story = {
  args: {
    state: "value",
    title: "Time zone",
    children: (
      <>
        <p>
          Time zone: <Identifier>Europe/Berlin</Identifier>. Schedules, logs and
          the clock use it.
        </p>
        <p>The clock is set automatically from the internet.</p>
      </>
    ),
    action: (
      <ExternalLink href="/#/system/date-time" newTabLabel={NEW_TAB}>
        Change it in the classic interface
      </ExternalLink>
    ),
  },
  render: Done.render,
};

export const Checking: Story = {
  args: {
    state: "checking",
    stateLabel: "Checking…",
    title: "Get email alerts",
  },
  render: Done.render,
};

/** One read failed: "Not checked", the reason, and a retry for this item only. */
export const ReadFailed: Story = {
  args: {
    state: "notChecked",
    stateLabel: "Not checked",
    title: "Use a secure connection (HTTPS)",
    children: <p>Could not read the web interface settings.</p>,
    retry: { label: "Try again", onRetry: () => undefined },
  },
  render: Done.render,
};

/** Values from the server are text, and a long name breaks inside its line. */
export const LongValue: Story = {
  args: {
    state: "value",
    title: "Name of your NAS",
    children: (
      <p>
        Your NAS is called{" "}
        <Identifier>
          {"<img src=x>-nas-in-the-basement-cupboard-behind-the-boiler"}
        </Identifier>
        . Other computers on your network find it by this name.
      </p>
    ),
  },
  render: Done.render,
};
