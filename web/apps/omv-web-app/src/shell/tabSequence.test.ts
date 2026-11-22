// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { nextStop, tabStops } from "./tabSequence.ts";

type Attrs = Record<string, string | boolean>;

function el(tag: string, attrs: Attrs = {}, ...children: HTMLElement[]) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) {
      element.setAttribute(name, "");
    } else if (value !== false) {
      element.setAttribute(name, value);
    }
  }
  element.append(...children);
  return element;
}

function mount(...children: HTMLElement[]) {
  const root = el("div", {}, ...children);
  document.body.append(root);
  return (id: string) => root.querySelector<HTMLElement>(`#${id}`);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("tabStops", () => {
  it("keeps a reachable stop as itself and skips what is missing", () => {
    const get = mount(el("button", { id: "a" }), el("button", { id: "b" }));
    expect(
      tabStops([get("b"), null, undefined, get("a")]).map((e) => e.id),
    ).toEqual(["b", "a"]);
  });

  it("stands a container for its reachable controls, in document order", () => {
    const get = mount(
      el(
        "div",
        { id: "group" },
        el("input", { id: "i1" }),
        el("button", { id: "off", disabled: true }),
        el("span", { id: "r", tabindex: "0" }),
        el("span", { tabindex: "-1" }),
        el("input", { type: "hidden" }),
        el("div", { hidden: true }, el("input", { id: "gone" })),
        el("textarea", { id: "t" }),
      ),
      el("button", { id: "save" }),
    );
    expect(tabStops([get("group"), get("save")]).map((e) => e.id)).toEqual([
      "i1",
      "r",
      "t",
      "save",
    ]);
  });

  it("keeps a control that is only aria-disabled (focusable while unavailable)", () => {
    const get = mount(el("button", { id: "c", "aria-disabled": "true" }));
    expect(tabStops([get("c")]).map((e) => e.id)).toEqual(["c"]);
  });
});

describe("nextStop", () => {
  const ids = ["cancel", "typed", "confirm", "instead"];
  const setUp = () =>
    mount(
      el("button", { id: "cancel" }),
      el("input", { id: "typed" }),
      el("button", { id: "confirm" }),
      el("button", { id: "instead" }),
    );

  it.each([
    ["cancel", false, "typed"],
    ["typed", false, "confirm"],
    ["confirm", false, "instead"],
    ["instead", false, "cancel"],
    ["cancel", true, "instead"],
    ["typed", true, "cancel"],
  ])("from %s (backwards %s) goes to %s", (from, backwards, to) => {
    const get = setUp();
    const order = tabStops(ids.map(get));
    expect(nextStop(order, get(from), backwards)?.id).toBe(to);
  });

  it("leaves focus outside the sequence to the browser", () => {
    const get = setUp();
    expect(
      nextStop(tabStops([get("cancel"), get("typed")]), get("confirm"), false),
    ).toBeNull();
  });

  it("does nothing with a single stop", () => {
    const get = setUp();
    expect(
      nextStop(tabStops([get("cancel")]), get("cancel"), false),
    ).toBeNull();
  });
});
