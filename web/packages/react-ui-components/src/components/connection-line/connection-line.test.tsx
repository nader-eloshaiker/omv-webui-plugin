// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionLine } from "./connection-line";

describe("ConnectionLine", () => {
  it("is a status line whose values are isolated left to right", () => {
    render(
      <ConnectionLine address="192.0.2.10" iface="enp2s0">
        {(parts) => (
          <>
            This page reaches the NAS at {parts.address} through {parts.iface}.
          </>
        )}
      </ConnectionLine>,
    );
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent(
      "This page reaches the NAS at 192.0.2.10 through enp2s0.",
    );
    const values = line.querySelectorAll("bdi");
    expect(values).toHaveLength(2);
    for (const value of values) {
      expect(value).toHaveAttribute("dir", "ltr");
      expect(value.querySelector("code")).not.toBeNull();
    }
  });

  it("renders a sentence without values as given", () => {
    render(
      <ConnectionLine>
        This page reaches the NAS through a tunnel or on the NAS itself.
      </ConnectionLine>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "This page reaches the NAS through a tunnel or on the NAS itself.",
    );
  });

  it("renders a hostile host name as text", () => {
    render(
      <ConnectionLine host={'<img src=x onerror="alert(1)">'}>
        {(parts) => <>This page reaches the NAS as {parts.host}.</>}
      </ConnectionLine>,
    );
    const line = screen.getByRole("status");
    expect(line.querySelector("img")).toBeNull();
    expect(line).toHaveTextContent('<img src=x onerror="alert(1)">');
  });
});
