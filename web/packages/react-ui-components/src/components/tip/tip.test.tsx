// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time tip as a person meets it: it shows once, "Got it" or its first success ends it, it
// never shows with tips off, and only one shows at a time. The provider here holds the flags in
// memory, as the app's stores would.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { Tip } from "./tip";
import { useTips } from "./tips-context";
import { TipsProvider } from "./tips-provider";

const SAVE_LINE =
  "Saved. Your change waits in the yellow bar until you apply it.";
const TRACE_LINE =
  "Point at a folder, a disk or a way in to see what belongs to it.";

/** The ids the app remembers, so a test can end a tip from outside, as a page's success would. */
interface Flags {
  seen: string[];
  end: (id: string) => void;
}

function Tips({
  show = true,
  initialSeen = [],
  flags,
  children,
}: {
  show?: boolean;
  initialSeen?: string[];
  flags?: { current: Flags | null };
  children: React.ReactNode;
}) {
  const [seen, setSeen] = React.useState(initialSeen);
  const onSeen = React.useCallback((id: string) => {
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
  }, []);
  React.useEffect(() => {
    if (flags) {
      flags.current = { seen, end: onSeen };
    }
  });
  return (
    <TipsProvider show={show} seen={seen} onSeen={onSeen}>
      {children}
    </TipsProvider>
  );
}

function SaveTip({ when }: { when?: boolean }) {
  return (
    <Tip
      id="tip.first-save"
      when={when}
      dismissLabel="Got it"
      dismissName="Got it, hide the tip about the yellow bar"
    >
      {SAVE_LINE}
    </Tip>
  );
}

function TraceTip() {
  return (
    <Tip
      id="tip.trace"
      dismissLabel="Got it"
      dismissName="Got it, hide the tip about pointing at the map"
    >
      {TRACE_LINE}
    </Tip>
  );
}

describe("Tip", () => {
  it("shows its line with a dismiss button that names the tip", () => {
    render(
      <Tips>
        <SaveTip />
      </Tips>,
    );
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    const dismiss = screen.getByRole("button", {
      name: "Got it, hide the tip about the yellow bar",
    });
    expect(dismiss).toHaveTextContent("Got it");
  });

  it("ends for good on Got it", async () => {
    const user = userEvent.setup();
    const flags: { current: Flags | null } = { current: null };
    render(
      <Tips flags={flags}>
        <SaveTip />
      </Tips>,
    );
    await user.click(screen.getByRole("button", { name: /^Got it/ }));
    expect(flags.current?.seen).toEqual(["tip.first-save"]);
    await waitFor(() => {
      expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    });
  });

  it("ends on its first success, and stays away once seen", async () => {
    const flags: { current: Flags | null } = { current: null };
    const { unmount } = render(
      <Tips flags={flags}>
        <TraceTip />
      </Tips>,
    );
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    act(() => {
      flags.current?.end("tip.trace");
    });
    await waitFor(() => {
      expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    });
    unmount();
    render(
      <Tips initialSeen={["tip.trace"]}>
        <TraceTip />
      </Tips>,
    );
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });

  it("waits until it has something to explain", () => {
    function Page() {
      const [saved, setSaved] = React.useState(false);
      return (
        <Tips>
          <button
            type="button"
            onClick={() => {
              setSaved(true);
            }}
          >
            Save
          </button>
          <SaveTip when={saved} />
        </Tips>
      );
    }
    render(<Page />);
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
  });

  it("never shows with tips off, and tips off is not Got it", () => {
    const flags: { current: Flags | null } = { current: null };
    render(
      <Tips show={false} flags={flags}>
        <TraceTip />
      </Tips>,
    );
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    expect(flags.current?.seen).toEqual([]);
  });

  it("says why it is needed outside a TipsProvider", () => {
    // React reports the thrown error on the console as well; that is the message under test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<TraceTip />)).toThrow(
      "A tip needs a TipsProvider round it.",
    );
    spy.mockRestore();
  });
});

describe("one tip at a time", () => {
  function Two({
    firstWhen = true,
    flags,
  }: {
    firstWhen?: boolean;
    flags?: { current: Flags | null };
  }) {
    return (
      <Tips flags={flags}>
        <SaveTip when={firstWhen} />
        <TraceTip />
      </Tips>
    );
  }

  it("shows the first in reading order, and the next once it has gone", async () => {
    const user = userEvent.setup();
    render(<Two />);
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Got it/ })).toHaveLength(1);

    await user.click(
      screen.getByRole("button", {
        name: "Got it, hide the tip about the yellow bar",
      }),
    );
    await waitFor(() => {
      expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    });
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
  });

  it("keeps a tip on screen when an earlier one becomes due, and shows that one next", async () => {
    const flags: { current: Flags | null } = { current: null };
    const { rerender } = render(<Two firstWhen={false} flags={flags} />);
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    rerender(<Two firstWhen flags={flags} />);
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    act(() => {
      flags.current?.end("tip.trace");
    });
    await waitFor(() => {
      expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    });
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });

  it("lets a tip that succeeded while waiting end without ever showing", async () => {
    const flags: { current: Flags | null } = { current: null };
    render(<Two flags={flags} />);
    act(() => {
      flags.current?.end("tip.trace");
    });
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    act(() => {
      flags.current?.end("tip.first-save");
    });
    await waitFor(() => {
      expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });
});

describe("useTips", () => {
  it("reads whether a tip was seen from the app's flags", () => {
    function Probe() {
      const { isSeen } = useTips();
      return <span>{isSeen("tip.palette") ? "seen" : "new"}</span>;
    }
    render(
      <Tips initialSeen={["tip.palette"]}>
        <Probe />
      </Tips>,
    );
    expect(screen.getByText("seen")).toBeInTheDocument();
  });
});
