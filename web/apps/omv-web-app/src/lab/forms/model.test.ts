// SPDX-License-Identifier: GPL-3.0-or-later
import {
  changedCounts,
  defaultDrive,
  DRIVES_SEVERAL,
  effectiveAccess,
  folderProblems,
  folderSentences,
  initialFolder,
  initialPerson,
  personAccess,
  personProblems,
  personSentences,
  strength,
  suggestPassword,
} from "./model.ts";

const OFF = { smbOn: false, nfsOn: false };
const text = (parts: string[]) => parts.join("");

describe("Add a shared folder defaults (spec 3.4)", () => {
  it("chooses the mounted drive with the most free space, never an unavailable one", () => {
    expect(defaultDrive(DRIVES_SEVERAL)).toBe("media");
  });

  it("never makes a folder nobody can open: everyone can read and change by default", () => {
    const form = initialFolder(DRIVES_SEVERAL);
    expect(form.who).toBe("everyone");
    expect([...effectiveAccess(form).values()].every((a) => a === "rw")).toBe(
      true,
    );
    expect(folderProblems({ ...form, name: "Photos2" })).toEqual([]);
  });

  it("asks for a name and reports a taken one, ignoring case", () => {
    const form = initialFolder(DRIVES_SEVERAL);
    expect(folderProblems(form).map((p) => p.field)).toEqual(["name"]);
    expect(folderProblems({ ...form, name: "music" })[0]?.text).toBe(
      "A shared folder called Music already exists.",
    );
  });

  it("reports a chosen-people folder with nobody in it", () => {
    const form = {
      ...initialFolder(DRIVES_SEVERAL),
      name: "X",
      who: "chosen" as const,
    };
    expect(folderProblems(form).map((p) => p.field)).toEqual(["who"]);
  });

  it("counts what More options hides", () => {
    const form = initialFolder(DRIVES_SEVERAL);
    expect(changedCounts(form)).toEqual({ name: 0, where: 0, how: 0 });
    expect(changedCounts({ ...form, guest: true, browseable: false }).how).toBe(
      2,
    );
    expect(changedCounts({ ...form, name: "A", path: "A" }).where).toBe(0);
    expect(changedCounts({ ...form, name: "A", path: "pics" }).where).toBe(1);
  });
});

describe("the folder's consequence summary (spec 3.7, 3.11)", () => {
  it("says the default case in the spec's order, ending with when it takes effect", () => {
    const form = {
      ...initialFolder(DRIVES_SEVERAL),
      name: "Photos",
      drive: "data",
    };
    const sentences = folderSentences(form, DRIVES_SEVERAL, OFF);
    expect(sentences.map((s) => s.id)).toEqual([
      "made",
      "people",
      "smb",
      "smbOn",
      "effect",
    ]);
    expect(text(sentences[0]?.parts ?? [])).toBe(
      "Photos is made on Data drive, which has 7.8 GiB free.",
    );
    expect(text(sentences[1]?.parts ?? [])).toBe(
      "6 people can read and change files. Nobody else can open it.",
    );
    expect(text(sentences[2]?.parts ?? [])).toBe(
      "Windows computers open it at \\\\nas\\Photos, Macs at smb://nas/Photos.",
    );
  });

  it("states guest access with the warning shape when it is on", () => {
    const form = {
      ...initialFolder(DRIVES_SEVERAL),
      name: "Photos",
      guest: true,
    };
    const guest = folderSentences(form, DRIVES_SEVERAL, OFF).find(
      (s) => s.id === "guest",
    );
    expect(guest?.tone).toBe("warning");
  });

  it("keeps bold parts at odd positions, so names stand out", () => {
    const form = {
      ...initialFolder(DRIVES_SEVERAL),
      name: "Photos",
      who: "chosen" as const,
      picked: { "g:family": "rw" as const, "p:jo": "ro" as const },
    };
    const people = folderSentences(form, DRIVES_SEVERAL, OFF).find(
      (s) => s.id === "people",
    );
    expect(people?.parts).toEqual([
      "",
      "alex, sam and robin",
      " can read and change files; ",
      "jo",
      " can read them. Nobody else can open it.",
    ]);
  });
});

describe("Add a person", () => {
  it("gives access through a group, and says so", () => {
    const form = { ...initialPerson(), name: "alex", groups: ["family"] };
    expect(personAccess(form).filter((a) => a.access !== "none")).toEqual([
      { folder: "Photos", access: "rw", through: "family" },
      { folder: "Music", access: "ro", through: "family" },
    ]);
    const opens = personSentences(form).find((s) => s.id === "opens");
    expect(text(opens?.parts ?? [])).toBe(
      "alex can open Photos (read and change) and Music (read only), through family.",
    );
  });

  it("does not ask to type a suggested password again", () => {
    const form = {
      ...initialPerson(),
      name: "alex",
      password: "abcde-fghij-kmnpq-rstuv",
      suggested: true,
    };
    expect(personProblems(form)).toEqual([]);
    expect(
      personProblems({ ...form, suggested: false }).map((p) => p.field),
    ).toEqual(["again"]);
  });
});

describe("passwords", () => {
  it.each([
    ["", "Too short"],
    ["abc", "Too short"],
    ["sunshine", "Weak"],
    ["aaaaaaaaaaaaaaaa", "Weak"],
    ["lantern-otter-cobalt-97", "Very strong"],
  ])("rates %j as %s", (password, word) => {
    expect(strength(password).word).toBe(word);
  });

  it("suggests four groups of five from the unambiguous alphabet", () => {
    let n = 0;
    const password = suggestPassword((bytes) => {
      bytes.forEach((_, i) => {
        bytes[i] = (n += 7) % 256;
      });
    });
    expect(password).toMatch(
      /^[a-km-zA-HJ-NP-Z2-9]{5}(-[a-km-zA-HJ-NP-Z2-9]{5}){3}$/u,
    );
    expect(strength(password).word).toBe("Very strong");
  });
});
