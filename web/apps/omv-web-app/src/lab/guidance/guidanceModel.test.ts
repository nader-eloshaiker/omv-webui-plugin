// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance prototype's small decisions, and the view its query string selects.
import { describe, expect, it } from "vitest";
import { nasFor } from "../dashboard/model.ts";
import { captionsFor, tipState } from "./guidanceModel.ts";
import { guidanceQuery, readGuidanceView } from "./states.ts";

describe("captionsFor", () => {
  const newNas = nasFor("new-nas");
  it("captions every column on a new NAS while tips are on", () => {
    expect(captionsFor(newNas, true, false)).toHaveLength(5);
  });
  it("captions nothing with tips off or in compact density", () => {
    expect(captionsFor(newNas, false, false)).toEqual([]);
    expect(captionsFor(newNas, true, true)).toEqual([]);
  });
  it("captions the shared folders alone while there are none on an existing NAS", () => {
    expect(captionsFor(nasFor("no-folders"), true, false)).toEqual(["folders"]);
    expect(captionsFor(nasFor("all-ok"), true, false)).toEqual([]);
  });
});

describe("tipState", () => {
  const base = {
    id: "tip.trace" as const,
    show: true,
    seen: false,
    when: true,
    current: null,
  };
  it.each([
    [{}, "waiting"],
    [{ current: "tip.trace" }, "showing"],
    [{ seen: true }, "ended"],
    [{ seen: true, current: "tip.trace" }, "showing"],
    [{ when: false }, "not-yet"],
    [{ show: false, current: "tip.trace" }, "off"],
  ] as const)("%o is %s", (patch, state) => {
    expect(tipState({ ...base, ...patch })).toBe(state);
  });
});

describe("the query string", () => {
  it("seeds the view, and leaves tips to the store when it says nothing", () => {
    expect(readGuidanceView("?screen=guidance")).toEqual({
      theme: "dark",
      density: "comfortable",
      motion: "full",
      width: "full",
      tips: null,
      menu: false,
      offer: false,
      still: false,
      chrome: true,
    });
    const v = readGuidanceView(
      "?theme=light&density=compact&tips=off&width=390&menu=open&toast=hide-tips&still=1&chrome=0",
    );
    expect(v).toMatchObject({
      theme: "light",
      density: "compact",
      tips: false,
      width: "390",
      menu: true,
      offer: true,
      still: true,
      chrome: false,
    });
  });

  it("ignores what it does not know", () => {
    expect(
      readGuidanceView("?theme=sepia&width=1&tips=maybe&menu=1"),
    ).toMatchObject({ theme: "dark", width: "full", tips: null, menu: false });
  });

  it("mirrors the view without the offer, which is a moment", () => {
    const q = guidanceQuery(
      {
        theme: "light",
        density: "compact",
        motion: "reduced",
        width: "900",
        menu: true,
        still: true,
        chrome: false,
      },
      false,
    );
    expect(q).toBe(
      "screen=guidance&theme=light&density=compact&tips=off&motion=reduced&width=900&menu=open&still=1&chrome=0",
    );
  });
});
