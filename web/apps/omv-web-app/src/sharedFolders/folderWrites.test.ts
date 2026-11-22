// SPDX-License-Identifier: GPL-3.0-or-later
import { ShareMgmtSetRequestSchema } from "@omv-webui/react-api-omv/forms";
import { describe, expect, it } from "vitest";
import { folderSetRequest } from "./folderWrites.ts";

const valid = (request: unknown) => {
  const result = ShareMgmtSetRequestSchema["~standard"].validate(request);
  return !(result instanceof Promise) && result.issues === undefined;
};

const ROW = {
  uuid: "00000000-0000-4000-8000-000000000201",
  name: "Photos",
  comment: "Family photos",
  mntentref: "00000000-0000-4000-8000-000000000002",
  reldirpath: "Photos/",
};

describe("folderSetRequest", () => {
  it("sends the row as read with only the description changed", () => {
    const request = folderSetRequest(ROW, {
      kind: "description",
      comment: "Holidays",
    });
    expect(request).toEqual({ ...ROW, comment: "Holidays" });
    expect(request).not.toHaveProperty("mode");
    expect(valid(request)).toBe(true);
  });

  it("points it somewhere else with mode 770, the description kept", () => {
    const request = folderSetRequest(ROW, {
      kind: "repoint",
      mntentref: "00000000-0000-4000-8000-000000000003",
      reldirpath: "Pictures/Photos",
    });
    expect(request).toEqual({
      ...ROW,
      mntentref: "00000000-0000-4000-8000-000000000003",
      reldirpath: "Pictures/Photos",
      mode: "770",
    });
    expect(valid(request)).toBe(true);
  });

  it("keeps the same place when the reader keeps it (a missing folder made again)", () => {
    expect(
      folderSetRequest(ROW, {
        kind: "repoint",
        mntentref: ROW.mntentref,
        reldirpath: "Photos",
      }),
    ).toMatchObject({ reldirpath: "Photos", mode: "770" });
  });
});
