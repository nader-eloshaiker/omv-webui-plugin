// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a trial run's output (phase 5 services design 0.6, 5.7), on the lines the test VM printed
// (the contract's execGetOutput examples, scrubbed).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { describe, expect, it } from "vitest";
import {
  failureCauses,
  failureOutput,
  lastLines,
  lineKind,
  readTrial,
  runLines,
} from "./trialOutput.ts";

const lines = (text: string) => text.split("\n");
const outputOf = (name: "rsyncTrialFinished" | "rsyncRunFinished"): string => {
  const example = CONTRACT_EXAMPLES.execGetOutput[name];
  return (example.value as { output: string }).output;
};
const messageOf = (
  name:
    | "rsyncHostKeyFailed"
    | "rsyncNotMountedFailed"
    | "rsyncPushSshFailed"
    | "rsyncWrongPasswordFailed"
    | "rsyncSecondStartFailed",
): string => {
  const example = CONTRACT_EXAMPLES.execGetOutput[name];
  return (example.value as { message: string }).message;
};

describe("a trial's lines", () => {
  it.each([
    ["", "chatter"],
    ["Please wait, syncing </srv/a/Media/> to </srv/a/Backup/> ...", "chatter"],
    ["The synchronisation has completed successfully.", "chatter"],
    ["sending incremental file list", "chatter"],
    ["receiving incremental file list", "chatter"],
    ["./", "chatter"],
    ["sent 236 bytes  received 122 bytes  716.00 bytes/sec", "summary"],
    ["total size is 40  speedup is 0.11 (DRY RUN)", "summary"],
    ["deleting old-dir/old.txt", "delete"],
    ["deleting old-dir/", "delete"],
    ["photos/2024/", "folder"],
    ["photos/2024/beach.jpg", "file"],
    ["rsync: [sender] link_stat failed", "unknown"],
    ["\u001b[31mnew.txt\u001b[0m", "file"],
  ])("%j is %s", (line, kind) => {
    expect(lineKind(line)).toBe(kind);
  });
});

describe("readTrial", () => {
  it("counts the VM's trial: files only, every deleting line listed", () => {
    expect(readTrial(lines(outputOf("rsyncTrialFinished")))).toEqual({
      copies: 2,
      deleteCount: 3,
      deletes: [
        "old-dir/deeper/older.txt",
        "old-dir/deeper/",
        "old-dir/old.txt",
        "old-dir/",
        "only-here.txt",
      ],
      exact: true,
      dryRun: true,
    });
  });

  it("reads a real run too, which is not a trial", () => {
    expect(readTrial(lines(outputOf("rsyncRunFinished")))).toMatchObject({
      copies: 4,
      deleteCount: 0,
      exact: true,
      dryRun: false,
    });
  });

  it("says the counts are not exact when a line no rule knows appears", () => {
    expect(
      readTrial(["sending incremental file list", "a.txt", "rsync: warning"]),
    ).toMatchObject({ copies: 1, exact: false });
  });
});

describe("a failed run", () => {
  it("drops OMV's command and keeps what the job printed", () => {
    const failed = failureOutput(messageOf("rsyncNotMountedFailed"));
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toBe(
      "[ERROR] Source storage device not mounted at </srv/dev-disk-by-uuid-00000000-0000-4000-8000-00000000000e/>!",
    );
  });

  it("is silent when a second start ends at once", () => {
    expect(failureOutput(messageOf("rsyncSecondStartFailed"))).toEqual({
      exitCode: 1,
      output: "",
    });
  });

  it("keeps a message of another form whole", () => {
    expect(failureOutput("Failed to open file.").output).toBe(
      "Failed to open file.",
    );
  });

  it.each([
    ["rsyncHostKeyFailed", ["hostKey"]],
    ["rsyncNotMountedFailed", ["notMounted"]],
    ["rsyncWrongPasswordFailed", ["denied"]],
    ["rsyncPushSshFailed", ["partial"]],
  ] as const)("names the cause of %s", (name, causes) => {
    const { output } = failureOutput(messageOf(name));
    expect(failureCauses(lines(output))).toEqual(causes);
  });

  it("keeps the last lines that say something", () => {
    expect(lastLines(["a", "", "b", "c"], 2)).toEqual(["b", "c"]);
  });
});

describe("a run's lines on screen", () => {
  const message = messageOf("rsyncHostKeyFailed");
  const { output } = failureOutput(message);
  const firstPart = output.split("\n").slice(0, 2).join("\n") + "\n";

  it("shows what was received once when the failing poll repeats it", () => {
    const lines = runLines(firstPart, message);
    expect(lines).toEqual(output.replace(/\n$/u, "").split("\n"));
    expect(
      lines.filter((l) => l === "Host key verification failed."),
    ).toHaveLength(1);
  });

  it("adds nothing when the output already ends with the account", () => {
    expect(runLines(output, message)).toEqual(
      output.replace(/\n$/u, "").split("\n"),
    );
  });

  it("adds an account that is new, and keeps a plain output", () => {
    expect(runLines("a\n", "Failed to open file (x).")).toEqual([
      "a",
      "Failed to open file (x).",
    ]);
    expect(runLines("a\nb\n")).toEqual(["a", "b"]);
    expect(runLines("", messageOf("rsyncSecondStartFailed"))).toEqual([]);
  });
});
