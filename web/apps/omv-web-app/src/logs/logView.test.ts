// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { LogRow } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  defaultSort,
  isLogId,
  LOG_IDS,
  logLayout,
  logRequest,
  nextSort,
  pageOf,
  searchRows,
  sortableFields,
  sortRows,
} from "./logView.ts";

const SYSLOG = CONTRACT_EXAMPLES.logFileGetList.syslog.value
  .data as unknown as LogRow[];
const AUDIT = CONTRACT_EXAMPLES.logFileGetList.smbAudit.value
  .data as unknown as LogRow[];
const iso = (ts: number) => new Date(ts * 1000).toISOString();

describe("the logs offered", () => {
  it("are the eleven stock logs, and nothing else is accepted", () => {
    expect(LOG_IDS).toHaveLength(11);
    expect(isLogId("syslog")).toBe(true);
    expect(isLogId("dpkg")).toBe(false);
    expect(isLogId("__proto__")).toBe(false);
  });

  it("each has its layout", () => {
    expect(logLayout("syslog")).toBe("journal");
    expect(logLayout("rsyncd")).toBe("journal");
    expect(logLayout("smartd")).toBe("timeMessage");
    expect(logLayout("apt_term")).toBe("message");
    expect(logLayout("smbdaudit")).toBe("audit");
  });

  it("is read whole, newest first, by line where there are no times", () => {
    expect(logRequest("auth")).toEqual({
      id: "auth",
      start: 0,
      limit: null,
      sortfield: "ts",
      sortdir: "desc",
    });
    expect(logRequest("apt_term").sortfield).toBe("rownum");
  });
});

describe("sorting", () => {
  it("defaults to newest first, and a header sorts ascending then reverses", () => {
    expect(defaultSort("journal")).toEqual({ field: "ts", direction: "desc" });
    expect(defaultSort("message")).toEqual({
      field: "rownum",
      direction: "desc",
    });
    const byUser = nextSort(defaultSort("audit"), "username");
    expect(byUser).toEqual({ field: "username", direction: "asc" });
    expect(nextSort(byUser, "username").direction).toBe("desc");
    expect(sortableFields("journal")).toEqual(["ts"]);
    expect(sortableFields("audit")).toContain("result");
  });

  it("keeps entries of the same second in their written order", () => {
    // Two lines of the capture share a second (rownum 28024 and 28023).
    const desc = sortRows(SYSLOG, { field: "ts", direction: "desc" });
    expect(desc.map((r) => r.rownum)).toEqual([
      28027, 28026, 28025, 28024, 28023,
    ]);
    const asc = sortRows(SYSLOG, { field: "ts", direction: "asc" });
    expect(asc.map((r) => r.rownum)).toEqual([
      28023, 28024, 28025, 28026, 28027,
    ]);
  });

  it("sorts text columns in natural order", () => {
    const rows = sortRows(AUDIT, { field: "operation", direction: "asc" });
    expect(rows.map((r) => r.operation)).toEqual(["openat", "unlinkat"]);
  });
});

describe("searching", () => {
  it("is case-insensitive and looks only at the shown columns", () => {
    expect(searchRows(SYSLOG, "AUTHORIZED", "journal", iso)).toHaveLength(5);
    // The host name is not shown, so it is not searched.
    expect(searchRows(SYSLOG, "nas", "journal", iso)).toHaveLength(0);
    expect(searchRows(AUDIT, "holiday", "audit", iso)).toHaveLength(1);
    expect(searchRows(AUDIT, "192.0.2.10", "audit", iso)).toHaveLength(2);
    expect(searchRows(SYSLOG, "  ", "journal", iso)).toBe(SYSLOG);
  });

  it("matches the time as it is displayed", () => {
    expect(searchRows(SYSLOG, "03:29:17", "journal", iso)).toHaveLength(2);
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i);
  it("gives the page, its range and the page count", () => {
    expect(pageOf(rows, 1, 50)).toMatchObject({
      page: 1,
      pageCount: 3,
      from: 51,
      to: 100,
    });
    expect(pageOf(rows, 2, 50).rows).toHaveLength(20);
  });

  it("moves back to the last page when the rows shrink", () => {
    expect(pageOf(rows.slice(0, 10), 2, 50)).toMatchObject({
      page: 0,
      from: 1,
      to: 10,
    });
    expect(pageOf([], 0, 50)).toMatchObject({
      page: 0,
      pageCount: 1,
      from: 0,
      to: 0,
    });
  });
});
