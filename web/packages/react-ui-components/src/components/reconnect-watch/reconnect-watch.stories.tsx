// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { RecoveryCard } from "../recovery-card/recovery-card";
import { IsolatedIdentifier } from "../text/isolated-identifier";
import { ReconnectWatch, type ReconnectWatchProps } from "./reconnect-watch";
import { useElapsedSeconds } from "./use-elapsed-seconds";

// The English words of phase 5 network design 1.5 and 1.9 (`netChange.*`).
const waiting = (seconds: number) =>
  seconds === 0
    ? "Waiting for the NAS to answer…"
    : `Waiting for the NAS to answer… ${String(seconds)} ${seconds === 1 ? "second" : "seconds"}`;

const copy = {
  label: "Copy the new address",
  copiedLabel: "Copied",
  selectedLabel: "Selected. Press Ctrl+C to copy.",
};

const meta = {
  title: "Components/ReconnectWatch",
  component: ReconnectWatch,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ReconnectWatch>;

export default meta;

function Show(props: ReconnectWatchProps) {
  return <ReconnectWatch {...props} />;
}

/**
 * Waiting, with the elapsed time counting up every second. A screen reader hears it when it starts
 * and every 15 seconds, not every tick. Under reduced motion the mark does not turn.
 */
export const Waiting: StoryObj = {
  render: function Render() {
    const [stopped, setStopped] = React.useState(false);
    const elapsed = useElapsedSeconds(!stopped);
    return stopped ? (
      <p className="text-sm text-muted-foreground">
        (Stopped: the app shows the recovery card now.)
      </p>
    ) : (
      <Show
        state="waiting"
        elapsedSeconds={elapsed}
        waiting={waiting}
        stopLabel="Stop waiting"
        onStop={() => setStopped(true)}
      />
    );
  },
};

/** A still frame at 18 seconds, for review in both themes. */
export const WaitingAt18Seconds: StoryObj = {
  render: () => (
    <Show
      state="waiting"
      elapsedSeconds={18}
      waiting={waiting}
      stopLabel="Stop waiting"
      onStop={() => undefined}
    />
  ),
};

export const ConnectedAgain: StoryObj = {
  render: () => (
    <Show
      state="connected"
      message={
        <>
          Connected again. This page reaches the NAS at{" "}
          <IsolatedIdentifier value="192.0.2.10" /> through{" "}
          <IsolatedIdentifier value="enp2s0" />.
        </>
      }
    />
  ),
};

/** After a change to an automatic address: the router gave the same one back. */
export const KeptTheAddress: StoryObj = {
  render: () => (
    <Show
      state="connected"
      message={
        <>
          The NAS kept the address <IsolatedIdentifier value="192.0.2.10" />.
        </>
      }
    />
  ),
};

/** A move that did not take effect: the NAS still answers at the old address. */
export const StillAtTheOldAddress: StoryObj = {
  render: () => (
    <Show
      state="connected"
      message={
        <>
          The NAS still answers at <IsolatedIdentifier value="192.0.2.10" />.
          The change may not have been applied.
        </>
      }
    />
  ),
};

const movedSteps = (
  <RecoveryCard
    variant="newFails"
    headingLevel={3}
    announce={false}
    title="If the NAS does not open at its new address"
    copy={{ copiedLabel: "Copied", selectedLabel: copy.selectedLabel }}
    newTabLabel="(opens in a new tab)"
    steps={{
      wait: {
        text: "Wait two minutes, then try again.",
        tryAgainLabel: "Try again",
        onTryAgain: () => undefined,
      },
      newAddress: {
        url: "http://192.0.2.20/ui/",
        text: (url) => <>Open the NAS at its new address: {url}</>,
        copyLabel: "Copy the new address",
        note: "This computer must be on the same network as the new address. If you mistyped it, it may be on another network.",
      },
      console: {
        intro:
          "If nothing else works, connect a screen and keyboard to the NAS (or open the virtual machine's console), sign in as root, and:",
        commands: [
          {
            id: "firstaid",
            command: "omv-firstaid",
            text: (command) => (
              <>
                type {command} and choose Configure network interface. It
                replaces every network setting with the one port you set up
                there.
              </>
            ),
          },
        ],
      },
    }}
  />
);

/** The moved card: the expected outcome of a new fixed address, not an error. No link passed. */
export const Moved: StoryObj = {
  render: () => (
    <Show
      state="moved"
      url="http://192.0.2.20/ui/"
      message={(url) => <>The NAS is now at {url}.</>}
      copy={copy}
      note="You need to sign in again there. If it does not open within two minutes, follow these steps."
    >
      {movedSteps}
    </Show>
  ),
};

/** With the link the caller allows: an address typed in this session (P7). */
export const MovedWithLink: StoryObj = {
  render: () => (
    <Show
      state="moved"
      url="http://192.0.2.20/ui/"
      message={(url) => <>The NAS is now at {url}.</>}
      copy={copy}
      link={{
        href: "http://192.0.2.20/ui/",
        label: "Open the NAS at its new address",
        newTabLabel: "(opens in a new tab)",
      }}
      note="You need to sign in again there. If it does not open within two minutes, follow these steps."
    >
      {movedSteps}
    </Show>
  ),
};

/** Moved to a new IPv6 address, bracketed in the web address. */
export const MovedIPv6: StoryObj = {
  render: () => (
    <Show
      state="moved"
      url="http://[2001:db8::20]/ui/"
      message={(url) => <>The NAS is now at {url}.</>}
      copy={copy}
    />
  ),
};

export const SignInNeeded: StoryObj = {
  render: () => (
    <Show
      state="signIn"
      message="The NAS answers, but this page needs you to sign in again."
      signInLabel="Sign in"
      onSignIn={() => undefined}
    />
  ),
};

/** Every outcome in turn, in one place, as the app shows them: each is announced on arrival. */
export const OneAfterAnother: StoryObj = {
  render: function Render() {
    const [step, setStep] = React.useState(0);
    const steps: ReconnectWatchProps[] = [
      {
        state: "waiting",
        elapsedSeconds: 31,
        waiting,
        stopLabel: "Stop waiting",
        onStop: () => undefined,
      },
      {
        state: "connected",
        message: "Connected again. This page reaches the NAS at 192.0.2.10.",
      },
      {
        state: "signIn",
        message: "The NAS answers, but this page needs you to sign in again.",
        signInLabel: "Sign in",
        onSignIn: () => undefined,
      },
    ];
    const current = steps[step % steps.length] ?? steps[0];
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="self-start text-sm text-action-label underline"
          onClick={() => setStep((n) => n + 1)}
        >
          Next outcome (story control)
        </button>
        {current ? <Show {...current} /> : null}
      </div>
    );
  },
};

/** 320px wide: the line and Stop waiting wrap; the moved card's values wrap anywhere. */
export const At320px: StoryObj = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <div className="flex flex-col gap-6">
      <Show
        state="waiting"
        elapsedSeconds={95}
        waiting={waiting}
        stopLabel="Stop waiting"
        onStop={() => undefined}
      />
      <Show
        state="moved"
        url="http://[2001:db8:85a3::8a2e:370:7334]/ui/"
        message={(url) => <>The NAS is now at {url}.</>}
        copy={copy}
      />
    </div>
  ),
};
