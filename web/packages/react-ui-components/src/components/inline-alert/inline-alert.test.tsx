// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServerMessage } from "../text/server-message";
import { InlineAlert } from "./inline-alert";

describe("InlineAlert", () => {
  it("announces a critical alert at once, with the server's words as text", () => {
    render(
      <InlineAlert tone="critical" title="The SSH settings were not saved.">
        <ServerMessage label="Message from the server">
          {"<b>Invalid port</b>"}
        </ServerMessage>
      </InlineAlert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The SSH settings were not saved.");
    expect(alert).toHaveTextContent("<b>Invalid port</b>");
    expect(alert.querySelector("b")).toBeNull();
  });

  it("announces a neutral notice politely, and can take focus after a failed save", () => {
    render(
      <InlineAlert tone="neutral" tabIndex={-1}>
        Saved SSH settings are waiting to be applied.
      </InlineAlert>,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("data-tone", "neutral");
    notice.focus();
    expect(notice).toHaveFocus();
  });
});
