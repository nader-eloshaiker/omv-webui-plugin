// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { isFolderAddress } from "./folderAddress.ts";

describe("a shared folder's address (design 2, UI-4)", () => {
  it.each([
    ["00000000-0000-4000-8000-000000000005", true],
    ["ABCDEF00-0000-4000-8000-00000000000a", true],
    ["add", false],
    ["Photos", false],
    ["00000000-0000-4000-8000-00000000000", false],
    ["00000000-0000-4000-8000-000000000005/x", false],
    [" 00000000-0000-4000-8000-000000000005", false],
    ["../../rpc.php", false],
    ["", false],
    [null, false],
  ])("%j: %s", (value, ok) => {
    expect(isFolderAddress(value)).toBe(ok);
  });
});
