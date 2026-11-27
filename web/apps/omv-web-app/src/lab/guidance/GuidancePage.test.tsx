// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance page with Show tips off: the tips, the captions and the ghost examples go, and no
// control, status, consequence or technical value goes with them (rethink P.3). Lab fixtures only;
// nothing here reaches the network.
import { TipsProvider, UiProvider } from "@omv-webui/react-ui-components";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useTipsPreference } from "../../hooks/useTipsPreference.ts";
import { clearStorage } from "../../stores/storageSnapshot.ts";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import { useTipsStore } from "../../stores/useTipsStore.ts";
import { GuidancePage } from "./GuidancePage.tsx";

afterEach(() => {
  useTipsStore.setState({ show: true, offered: false });
  useSeenStore.setState({ seen: [] });
  clearStorage();
});

/** The stored flags, with "Show tips" seeded for the view as the lab's query string does. */
function Tips({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <TipsProvider {...useTipsPreference({ show })}>{children}</TipsProvider>
  );
}

function page(tips: boolean) {
  return render(
    <UiProvider>
      <Tips show={tips}>
        <GuidancePage
          compact={false}
          chrome={false}
          onNote={() => undefined}
          onOpenPalette={() => undefined}
        />
      </Tips>
    </UiProvider>,
  );
}

/** Every control's role and name on the page, as a person's assistive technology lists them. */
function controls(): Set<string> {
  const roles = ["button", "textbox", "radio", "switch", "link"] as const;
  return new Set(
    roles.flatMap((role) =>
      screen
        .queryAllByRole(role)
        .map(
          (el) =>
            `${role}: ${el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""}`,
        ),
    ),
  );
}

/** Controls that are guidance themselves: a tip's own buttons, and First steps (P.3, G1). */
const GUIDANCE_ONLY = [
  /^button: Got it, hide the tip about /,
  /^button: What is different$/,
  // The welcome's link; Shortcuts offer the same with tips off.
  /^button: Open the classic interface$/,
  // First steps become Shortcuts (P.3, G1). Their actions stay on the map, and a step whose action
  // is nowhere else stays as a shortcut under its title ("Change the factory password", below).
  /^button: Add storage$/,
  /^button: Add a shared folder$/,
  /^button: Add a person$/,
  /^button: Change$/,
];

const STATUSES = ["Almost full", "OK", "Not checked yet"];
const CONSEQUENCES = [
  /Photos is made on Data drive, which has 290 GiB free\./,
  /Windows computers open it at \\\\nas\\Photos, Macs at smb:\/\/nas\/Photos\./,
  /Nothing changes until you press Create Photos\./,
];
const TECHNICAL = ["sdc", "92 % used, 290 GiB free", "enp2s0", "nvme0n1"];
const KEPT_CONTROLS = [
  "Name",
  "Workgroup",
  "Copy the Windows address",
  "What is a workgroup?",
  "Which should I choose?",
  "SMB, what it means",
  "What is a shared folder?",
  "Add a person",
  "Change the factory password",
  "Save",
];

describe("the guidance page", () => {
  it("keeps every control with tips off, but the tips' own and First steps", () => {
    const on = page(true);
    const withTips = controls();
    on.unmount();
    page(false);
    const without = controls();
    const lost = [...withTips].filter(
      (c) => !without.has(c) && !GUIDANCE_ONLY.some((g) => g.test(c)),
    );
    expect(lost).toEqual([]);
  });

  it("keeps every status, consequence and technical value with tips off", () => {
    page(false);
    for (const word of STATUSES) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    const summary = screen.getByRole("list", {
      name: "What pressing the button does",
    });
    const sentences = within(summary)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    for (const sentence of CONSEQUENCES) {
      expect(sentences.some((t) => sentence.test(t))).toBe(true);
    }
    for (const value of TECHNICAL) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    for (const name of KEPT_CONTROLS) {
      const found = [
        ...screen.queryAllByRole("button", { name }),
        ...screen.queryAllByRole("textbox", { name }),
      ];
      expect(found.length, name).toBeGreaterThan(0);
    }
  });

  it("shows one tip, the captions and First steps with tips on", () => {
    page(true);
    // The welcome is first in reading order; the map's tip waits for it.
    expect(
      screen.getByText(/Welcome to the new interface/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Point at a folder/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Got it, hide the tip about/ }),
    ).toHaveLength(1);
    expect(
      screen.getByText("A disk made ready to keep files."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "First steps" }),
    ).toBeInTheDocument();
  });

  it("with tips off shows Shortcuts, no tip and no caption", () => {
    page(false);
    expect(screen.queryByText(/Point at a folder/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Welcome to the new interface/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("A disk made ready to keep files."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Shortcuts" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Example")).not.toBeInTheDocument();
  });

  it("folds Which should I choose? into its (?) icon with the same name", async () => {
    const user = userEvent.setup();
    page(false);
    const help = screen.getByRole("button", { name: "Which should I choose?" });
    expect(help).toHaveAttribute("aria-expanded", "false");
    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/Choose Windows and Mac unless a device asks for NFS/),
    ).toBeVisible();
  });

  it("ends the welcome when the person does something else on the page", async () => {
    const user = userEvent.setup();
    page(true);
    // The welcome is the first tip on this page.
    expect(
      screen.getByText(/Welcome to the new interface/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("textbox", { name: "Name" }));
    expect(useSeenStore.getState().seen).toContain("tip.new-interface");
  });
});
