// SPDX-License-Identifier: GPL-3.0-or-later
// The connection line (phase 5 network design 0.4) for each conclusion, and the impact line under a
// form with the Save button it describes (1.4, 19.2): words for every class, values as text.
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReviewButton } from "../../hooks/useNetworkWords.ts";
import type { Connection } from "../../network/connection.ts";
import type { Impact } from "../../network/impact.ts";
import "../../services/i18n/index.ts";
import { NetworkConnectionLine } from "./NetworkConnectionLine.tsx";
import { NetworkImpactLine } from "./NetworkImpactLine.tsx";

const HOSTILE = "<script>alert(1)</script>‮nas";

describe("NetworkConnectionLine", () => {
  it.each<[string, Connection, string]>([
    [
      "known",
      {
        kind: "known",
        host: "192.0.2.10",
        iface: "enp2s0",
        address: "192.0.2.10",
        family: 4,
        network: null,
        under: [],
      },
      "This page reaches the NAS at 192.0.2.10 through enp2s0.",
    ],
    [
      "probable",
      {
        kind: "probable",
        host: "nas",
        nameForm: "short",
        iface: "enp2s0",
        under: [],
      },
      "This page reaches the NAS by its name, nas, most likely through enp2s0.",
    ],
    [
      "nameOnly",
      { kind: "nameOnly", host: "nas.local", nameForm: "local" },
      "This page reaches the NAS by its name, nas.local. It cannot tell through which interface.",
    ],
    [
      "unknownAddress",
      { kind: "unknownAddress", host: "203.0.113.9", family: 4 },
      "This page reaches the NAS at 203.0.113.9. No interface of the NAS reports that address, so this page cannot tell which one it uses. A router or a VPN may be passing it on.",
    ],
    [
      "otherName",
      { kind: "otherName", host: "files.example.org" },
      "This page reaches the NAS as files.example.org. It cannot tell through which interface.",
    ],
    [
      "tunnel",
      { kind: "tunnel", host: "localhost", families: [4, 6] },
      "This page reaches the NAS through a tunnel or on the NAS itself. It cannot tell which interface the tunnel uses.",
    ],
    [
      "unmanaged",
      {
        kind: "unmanaged",
        host: "203.0.113.5",
        iface: "wg0",
        address: "203.0.113.5",
        family: 4,
        network: null,
        virtual: true,
      },
      "This page reaches the NAS at 203.0.113.5 through wg0, which the network settings here do not manage.",
    ],
    [
      "readFailed",
      { kind: "readFailed", host: "nas" },
      "This page could not read the NAS's interfaces, so it cannot tell which one it uses.",
    ],
    [
      "loading",
      { kind: "loading" },
      "Working out which interface this page uses…",
    ],
  ])("%s", (_kind, connection, words) => {
    render(<NetworkConnectionLine connection={connection} />);
    expect(screen.getByRole("status")).toHaveTextContent(words);
  });

  it("renders a hostile name as text, its direction controls shown", () => {
    const { container } = render(
      <NetworkConnectionLine
        connection={{ kind: "otherName", host: HOSTILE }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain("‮");
  });
});

describe("NetworkImpactLine and the Save button it describes", () => {
  const location = { protocol: "http:", hostname: "192.0.2.10", port: "" };
  const impacts: [string, Impact, string, string][] = [
    [
      "none",
      { class: "none", findings: [] },
      "This page keeps working.",
      "Save",
    ],
    [
      "brief",
      { class: "brief", findings: [{ class: "brief" }] },
      "This page may stop responding for a few seconds while the network restarts, then carries on.",
      "Save",
    ],
    [
      "moves",
      {
        class: "moves",
        findings: [
          {
            class: "moves",
            effect: "netChange.effect.newAddress",
            family: 4,
            old: "192.0.2.10",
            new: "192.0.2.20",
          },
        ],
      },
      "This page stops working at 192.0.2.10. The NAS will be at 192.0.2.20.This page stops working at 192.0.2.10. Open the NAS at its new address afterwards: http://192.0.2.20/ui/",
      "Review the change…",
    ],
    [
      "mayCut",
      {
        class: "mayCut",
        findings: [
          { class: "mayCut", effect: "netChange.effect.mtu", size: 9000 },
        ],
      },
      "If this setting is wrong, this page loses the NAS, and you need another way in to put it right.If any device on this network does not take packets of 9000 bytes, this page and other computers may lose the NAS.",
      "Review the change…",
    ],
  ];

  // The class's words and the specific line are two blocks of the line: no space between them.
  it.each(impacts)("%s", (_kind, impact, words, label) => {
    const { result } = renderHook(() => useReviewButton(impact));
    render(
      <>
        <NetworkImpactLine
          impact={impact}
          location={location}
          id={result.current.impactLineId}
        />
        <button type="button" aria-describedby={result.current.impactLineId}>
          {result.current.label}
        </button>
      </>,
    );
    const line = document.getElementById(result.current.impactLineId);
    expect(line).toHaveTextContent(words);
    expect(
      screen.getByRole("button", { name: label }),
    ).toHaveAccessibleDescription(expect.stringContaining(words.slice(0, 20)));
    expect(result.current.opensFlow).toBe(label !== "Save");
  });

  it("Refused: the page's reason, and Save unavailable", () => {
    const impact: Impact = {
      class: "refused",
      findings: [
        {
          class: "refused",
          refusal: { code: "firewall.pageRefused", otherWay: false },
        },
      ],
    };
    const { result } = renderHook(() => useReviewButton(impact));
    expect(result.current.refused).toBe(true);
    render(
      <NetworkImpactLine
        impact={impact}
        location={location}
        refusal="These rules would block this page for every computer, this one too."
      />,
    );
    expect(
      screen.getByText(
        "These rules would block this page for every computer, this one too.",
      ),
    ).toBeVisible();
  });
});
