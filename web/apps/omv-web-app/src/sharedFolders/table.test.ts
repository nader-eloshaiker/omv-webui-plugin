// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  clampPage,
  INITIAL_TABLE_STATE,
  listRequest,
  nextSort,
  pageCount,
  problems,
  rangeOf,
  statusView,
} from "./table.ts";
import { createTableStore } from "./tableStore.ts";

describe("listRequest", () => {
  it("asks for the first 25 by name, ascending, with no search, as the stock page does", () => {
    expect(listRequest(INITIAL_TABLE_STATE)).toEqual({
      start: 0,
      limit: 25,
      sortfield: "name",
      sortdir: "asc",
    });
  });

  it.each([
    [
      { page: 2, pageSize: 10 },
      { start: 20, limit: 10 },
    ],
    [
      { page: 1, pageSize: 100 },
      { start: 100, limit: 100 },
    ],
  ])("maps page %j to start and limit %j", (state, expected) => {
    expect(listRequest({ ...INITIAL_TABLE_STATE, ...state })).toMatchObject(
      expected,
    );
  });

  it("sends the sort and the search as the backend names them", () => {
    expect(
      listRequest({
        ...INITIAL_TABLE_STATE,
        sort: { field: "status", direction: "desc" },
        searchInput: "media",
        search: "  media ",
      }),
    ).toEqual({
      start: 0,
      limit: 25,
      sortfield: "status",
      sortdir: "desc",
      search: "media",
    });
    expect(
      listRequest({ ...INITIAL_TABLE_STATE, search: "   " }),
    ).not.toHaveProperty("search");
  });
});

describe("nextSort", () => {
  it("sorts a new column ascending and reverses the sorted one", () => {
    const byName = INITIAL_TABLE_STATE.sort;
    expect(nextSort(byName, "status")).toEqual({
      field: "status",
      direction: "asc",
    });
    expect(nextSort(byName, "name")).toEqual({
      field: "name",
      direction: "desc",
    });
    expect(nextSort({ field: "name", direction: "desc" }, "name")).toEqual(
      byName,
    );
  });
});

describe("paging", () => {
  it("counts pages, at least one", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(132, 25)).toBe(6);
  });

  it("goes back to the last page that exists when the list shrinks", () => {
    expect(clampPage(5, 132, 25)).toBe(5);
    expect(clampPage(5, 40, 25)).toBe(1);
    expect(clampPage(3, 0, 25)).toBe(0);
    expect(clampPage(0, 0, 25)).toBe(0);
  });

  it("states the rows shown", () => {
    expect(rangeOf(0, 25, 132)).toEqual({ from: 1, to: 25, total: 132 });
    expect(rangeOf(5, 25, 132)).toEqual({ from: 126, to: 132, total: 132 });
    expect(rangeOf(0, 25, 12)).toEqual({ from: 1, to: 12, total: 12 });
    expect(rangeOf(0, 25, 0)).toEqual({ from: 0, to: 0, total: 0 });
  });
});

describe("statusView and problems", () => {
  it("reads OMV's codes, and shows an unknown one as itself", () => {
    expect(statusView("OK")).toEqual({ pill: "ok" });
    expect(statusView("ENOENT")).toEqual({
      pill: "critical",
      reason: "ENOENT",
    });
    expect(statusView("ENOTDIR")).toEqual({
      pill: "critical",
      reason: "ENOTDIR",
    });
    expect(statusView("ENOENT_DB_MNTENT")).toEqual({
      pill: "critical",
      reason: "ENOENT_DB_MNTENT",
    });
    expect(statusView("EFUTURE")).toEqual({ pill: "unknown", code: "EFUTURE" });
  });

  it("counts the folders that are not OK, worst first", () => {
    expect(problems([{ status: "OK" }])).toEqual({
      count: 0,
      total: 1,
      worst: null,
    });
    expect(
      problems([{ status: "EFUTURE" }, { status: "OK" }, { status: "ENOENT" }]),
    ).toEqual({ count: 2, total: 3, worst: "critical" });
    expect(problems([{ status: "EFUTURE" }])).toEqual({
      count: 1,
      total: 1,
      worst: "unknown",
    });
  });
});

describe("the table store", () => {
  it("keeps changes for the session and resets to the stock view", () => {
    const store = createTableStore();
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.set({ page: 3, search: "media" });
    expect(store.getState()).toMatchObject({ page: 3, search: "media" });
    store.reset();
    expect(store.getState()).toBe(INITIAL_TABLE_STATE);
    expect(heard).toBe(2);
    store.reset();
    expect(heard).toBe(2);
  });
});
