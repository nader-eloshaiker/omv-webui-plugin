// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Processes through the whole app on MSW: the summary and the process table from the
// captured System.getTopInfo reply, the 5 s background poll (UI-14) and its pause, search and sort in
// the browser, the error and filtered-empty states, command lines as text (UI-2), and a normal user
// kept off the page without a call (UI-4).
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";
import { rowValues } from "../../test/tableText.ts";

async function processes(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/diagnostics/processes",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Processes" });
  return app;
}

const reads = () => seenCalls.filter((c) => c.call === "System.getTopInfo");
const table = () => screen.getByRole("table", { name: "Processes" });
const summary = () => screen.getByRole("region", { name: "Summary" });

function fact(label: string) {
  const term = within(summary()).getByText(label, { selector: "dt" });
  return term.nextElementSibling;
}

describe("Processes", () => {
  it("summarises the processes, memory, swap and load, and lists them busiest first", async () => {
    await processes();
    await within(table()).findByText("systemd");
    expect(reads()[0]?.params).toEqual({ format: "json" });
    expect(reads()[0]?.background).toBe(true);
    expect(fact("Processes")).toHaveTextContent("174: 1 running, 173 sleeping");
    expect(within(summary()).getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "382.6 MiB of 3.8 GiB in use (10%)",
    );
    expect(fact("Memory")).toHaveTextContent(
      "Another 833.6 MiB holds recently used files and is freed when programs need it.",
    );
    expect(fact("Swap")).toHaveTextContent("No swap space is set up.");
    expect(fact("Average load")).toHaveTextContent(
      "1 min 0.43 · 5 min 0.10 · 15 min 0.03",
    );

    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Program",
      "Processor",
      "Memory",
      "State",
      "User",
      "Processor time",
      "ID",
    ]);
    expect(
      within(table()).getByRole("columnheader", { name: "Processor" }),
    ).toHaveAttribute("aria-sort", "descending");
    const rows = within(table()).getAllByRole("row");
    expect(rows).toHaveLength(9);
    // Spaces as a reader sees them: a figure and its unit are held together by a no-break space.
    const values = (row: HTMLElement) => rowValues(row).replace(/\s+/g, " ");
    expect(values(rows[1]!)).toBe("systemd0%14.9 MiBSleepingroot1:06.401");
    expect(values(rows[4]!)).toBe(
      "kworker/R-kvfree_rcu_reclaim0%0 BIdleroot0:00.004",
    );
    // Stacked on a narrow screen, every value after the program says its column's word.
    expect(rows[1]).toHaveTextContent(
      "systemdProcessor0%Memory14.9 MiBStateSleepingUserrootProcessor time1:06.40ID1",
    );
    expect(
      screen.getByText(
        "Sleeping means waiting for something to do, which is normal for most programs.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Updated every 5 seconds\. Last update /),
    ).toBeInTheDocument();
  });

  it("adds stopped and zombie processes, shows swap, and shows a long command line as text", async () => {
    await processes({ scenario: "processesBusy" });
    await within(table()).findByText("defunct-child");
    expect(fact("Processes")).toHaveTextContent(
      "176: 2 running, 171 sleeping, 1 stopped, 2 finished but not cleared away (zombie)",
    );
    expect(within(summary()).getAllByRole("meter")[1]).toHaveAttribute(
      "aria-valuetext",
      "256.0 MiB of 1.0 GiB in use (25%)",
    );
    const busiest = within(table()).getAllByRole("row")[1]!;
    expect(busiest).toHaveTextContent("87%");
    expect(busiest).toHaveTextContent("Running");
    expect(busiest).toHaveTextContent("<b>end</b>");
    expect(busiest.querySelector("b")).toBeNull();
    expect(
      within(table()).getAllByText("Finished, not cleared away (zombie)"),
    ).toHaveLength(2);
    // 0.3% shows as under one percent.
    expect(within(table()).getByText("<1%")).toBeInTheDocument();
  });

  it("searches the program and the user, sorts on a header, and says when nothing matches", async () => {
    const { user } = await processes();
    await within(table()).findByText("systemd");
    const search = screen.getByRole("searchbox", { name: "Search processes" });
    await user.type(search, "kworker");
    await waitFor(() =>
      expect(within(table()).getAllByRole("row")).toHaveLength(6),
    );
    await user.click(within(table()).getByRole("button", { name: "ID" }));
    expect(
      within(table()).getByRole("columnheader", { name: "ID" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(within(table()).getAllByRole("row")[1]).toHaveTextContent(/4$/);
    await user.clear(search);
    await user.type(search, "<nobody>");
    expect(
      await screen.findByText('No processes match "<nobody>".'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByText("Clear the search", { selector: "button" }),
    );
    expect(search).toHaveFocus();
    expect(within(table()).getAllByRole("row")).toHaveLength(9);
  });

  it("polls every 5 seconds in the background, and stops while paused", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const { user } = await processes({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    await within(table()).findByText("systemd");
    const first = reads().length;
    await act(() => {
      vi.advanceTimersByTime(5_000);
    });
    await waitFor(() => expect(reads().length).toBeGreaterThan(first));
    expect(reads().every((c) => c.background)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Pause updates" }));
    // The line, and the same words announced once.
    expect(
      screen.getAllByText(/^Updates paused\. Showing the list from /),
    ).toHaveLength(2);
    const paused = reads().length;
    await act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(reads()).toHaveLength(paused);

    // Resuming reads at once, in the foreground: the reader asked.
    await user.click(screen.getByRole("button", { name: "Resume updates" }));
    await waitFor(() => expect(reads().length).toBe(paused + 1));
    expect(reads().at(-1)?.background).toBe(false);
    expect(screen.getByRole("button", { name: "Pause updates" })).toHaveFocus();
  });

  it("says plainly when the processes could not be read, and tries again", async () => {
    let fail = true;
    const { user } = await processes({
      answers: {
        systemGetTopInfo: () =>
          fail ? { status: 500, message: "top failed." } : "json",
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the processes.");
    expect(alert).toHaveTextContent("top failed.");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(table()).findByText("systemd")).toBeInTheDocument();
  });

  it("refuses a normal user without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/diagnostics/processes",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    expect(callNames()).not.toContain("System.getTopInfo");
  });
});
