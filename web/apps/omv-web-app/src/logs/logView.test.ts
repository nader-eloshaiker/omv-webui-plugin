// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { LogRow } from "@omv-webui/react-api-omv/generated";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it } from "vitest";
import {
  cleanLogText,
  defaultSort,
  isLogId,
  isLogTooLong,
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

describe("cleanLogText", () => {
  it("removes bidirectional controls, so a line cannot reverse part of itself", () => {
    // The logsHostile scenario's line, and every embedding, override, isolate and mark.
    expect(
      cleanLogText("\u202eright-to-left override, then javascript:alert(3)"),
    ).toBe("right-to-left override, then javascript:alert(3)");
    expect(
      cleanLogText(
        "a\u202ab\u202bc\u202cd\u202de\u2066f\u2067g\u2068h\u2069i\u200ej\u200fk\u061cl",
      ),
    ).toBe("abcdefghijkl");
  });

  it("removes terminal escapes and keeps the text, line breaks and tabs", () => {
    expect(cleanLogText("\u001b[31mE:\u001b[0m failed")).toBe("E: failed");
    expect(cleanLogText("first\nsecond\tcolumn")).toBe("first\nsecond\tcolumn");
    expect(cleanLogText("שלום from a right-to-left message")).toBe(
      "שלום from a right-to-left message",
    );
  });

  it("drops a carriage return at the end of a line, as the updates log has", () => {
    expect(cleanLogText("Updating workbench configuration files ...\r")).toBe(
      "Updating workbench configuration files ...",
    );
    expect(cleanLogText("Progress: 10%\rProgress: 100%")).toBe(
      "Progress: 100%",
    );
  });

  it("gives the empty string for a field that is not text", () => {
    expect(cleanLogText(undefined)).toBe("");
    expect(cleanLogText(42)).toBe("");
  });
});

describe("a log too long for the NAS to send", () => {
  const error = (init: {
    status: number;
    message: string;
    unreadable?: boolean;
  }) =>
    new RpcError({
      code: init.unreadable ? null : 0,
      operationId: "logFileGetList",
      ...init,
    });

  it.each([
    {
      why: "PHP stopped rpc.php: 500 with an empty body",
      e: error({
        status: 500,
        message: "The server sent a reply that could not be read.",
        unreadable: true,
      }),
      want: true,
    },
    {
      why: "a 500 that says the memory was exhausted",
      e: error({
        status: 500,
        message:
          "Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes)",
      }),
      want: true,
    },
    {
      why: "an ordinary 500",
      e: error({
        status: 500,
        message:
          "Failed to execute command 'journalctl --no-pager': exit code '1'.",
      }),
      want: false,
    },
    {
      why: "a web server's own page for another status",
      e: error({
        status: 502,
        message: "The server sent a reply that could not be read.",
        unreadable: true,
      }),
      want: false,
    },
    {
      why: "no reply at all",
      e: error({ status: 0, message: "The server could not be reached." }),
      want: false,
    },
    {
      why: "not a reply error",
      e: new Error("Allowed memory size exhausted"),
      want: false,
    },
    { why: "nothing", e: undefined, want: false },
  ])("$why: $want", ({ e, want }) => {
    expect(isLogTooLong(e)).toBe(want);
  });
});
