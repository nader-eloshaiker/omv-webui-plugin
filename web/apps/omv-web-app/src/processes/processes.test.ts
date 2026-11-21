// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { TopInfo } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  cpuTimeSeconds,
  DEFAULT_PROCESS_SORT,
  loadAverages,
  memoryFigures,
  nextProcessSort,
  processCounts,
  processRows,
  searchProcesses,
  sortProcesses,
  swapFigures,
} from "./processes.ts";

const TOP = CONTRACT_EXAMPLES.systemGetTopInfo.json.value as unknown as TopInfo;
const MIB = 1024 * 1024;

describe("the summary", () => {
  it("reads the captured counts, memory, swap and load", () => {
    expect(processCounts(TOP)).toEqual({
      total: 174,
      running: 1,
      sleeping: 173,
      stopped: 0,
      zombie: 0,
    });
    const memory = memoryFigures(TOP);
    expect(memory?.total).toBe(3914 * MIB);
    expect(memory?.used).toBeCloseTo(382.6 * MIB);
    expect(memory?.cache).toBeCloseTo(833.6 * MIB);
    expect(memory?.percent).toBeCloseTo(9.78, 1);
    // The VM has no swap space ("0.0").
    expect(swapFigures(TOP)).toBe("none");
    expect(
      swapFigures({ ...TOP, swap_total: "1024.0", swap_used: "256.0" }),
    ).toMatchObject({
      percent: 25,
    });
    expect(loadAverages(TOP)).toEqual({
      one: "0.43",
      five: "0.10",
      fifteen: "0.03",
    });
  });

  it("gives nothing for a figure that does not parse", () => {
    expect(processCounts({ ...TOP, tasks_total: "" })).toBeNull();
    expect(memoryFigures({ ...TOP, mem_used: "n/a" })).toBeNull();
    expect(swapFigures({ ...TOP, swap_total: "?" })).toBeNull();
    expect(loadAverages({ ...TOP, load_5m: "" })).toBeNull();
  });
});

describe("cpuTimeSeconds", () => {
  it.each([
    ["1:06.40", 66.4],
    ["0:00.00", 0],
    ["123:45", 7425],
    ["", null],
    ["1:xx", null],
  ])("%s is %s seconds", (text, seconds) => {
    const value = cpuTimeSeconds(text);
    if (seconds === null) {
      expect(value).toBeNull();
    } else {
      expect(value).toBeCloseTo(seconds);
    }
  });
});

describe("the table", () => {
  const rows = processRows(TOP.processes);

  it("parses each row's numbers", () => {
    expect(rows[0]).toMatchObject({
      pid: 1,
      user: "root",
      command: "systemd",
      cpu: 0,
      memory: 15_642_624,
      state: "S",
      cpuTime: 66.4,
    });
  });

  it("sorts by processor use, busiest first, ties by ID", () => {
    const busy = processRows([
      { ...TOP.processes[2]!, PID: "30", "%CPU": "4.8" },
      ...TOP.processes,
    ]);
    const sorted = sortProcesses(busy, DEFAULT_PROCESS_SORT);
    expect(sorted[0]?.pid).toBe(30);
    expect(sorted.slice(1, 4).map((r) => r.pid)).toEqual([1, 2, 3]);
  });

  it("sorts numbers numerically and text naturally", () => {
    const byPid = sortProcesses(rows, { field: "pid", direction: "desc" });
    expect(byPid[0]?.pid).toBe(8);
    const byMemory = sortProcesses(
      rows,
      nextProcessSort(DEFAULT_PROCESS_SORT, "memory"),
    );
    expect(byMemory[0]?.command).toBe("systemd");
    const byName = sortProcesses(
      rows,
      nextProcessSort(DEFAULT_PROCESS_SORT, "command"),
    );
    expect(byName[0]?.command).toBe("kthreadd");
  });

  it("searches the program and the user", () => {
    expect(searchProcesses(rows, "KWORKER")).toHaveLength(5);
    expect(searchProcesses(rows, "root")).toHaveLength(8);
    expect(searchProcesses(rows, "nobody")).toHaveLength(0);
  });
});
