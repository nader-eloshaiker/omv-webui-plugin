// SPDX-License-Identifier: GPL-3.0-or-later
// The saved marks fed from a real query client's pending-modules entry, with each reply let go by the
// test: a reply asked for before the save forgets nothing, whenever it lands.
import { getSystemGetInformationQueryKey } from "@omv-webui/react-api-omv/generated";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectSavedMarks } from "./connectSavedMarks.ts";
import { createSavedMarks, type SavedMarks } from "./savedMarks.ts";

const KEY = getSystemGetInformationQueryKey();
const reply = (...modules: string[]) => ({
  dirtyModules: Object.fromEntries(modules.map((m) => [m, m])),
});
type Reply = ReturnType<typeof reply>;

let queryClient: QueryClient;
let marks: SavedMarks;
let disconnect: () => void;
let kept: boolean;
let save: () => void;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  marks = createSavedMarks();
  disconnect = connectSavedMarks(queryClient, marks);
  kept = false;
  const tracked = marks.track(["samba"], () => {
    kept = false;
  });
  save = () => {
    kept = true;
    tracked.saved();
  };
});

afterEach(() => {
  disconnect();
  queryClient.clear();
});

/** A fetch of the entry whose reply the test lets go. */
function fetchHeld() {
  let answer: (value: Reply) => void = () => undefined;
  const done = queryClient.fetchQuery({
    queryKey: KEY,
    staleTime: 0,
    queryFn: () =>
      new Promise<Reply>((resolve) => {
        answer = resolve;
      }),
  });
  // A fetch cancelled with its entry rejects; the test that does so does not wait for it.
  done.catch(() => undefined);
  return {
    answer: async (value: Reply) => {
      answer(value);
      await done;
    },
  };
}

const fetchNow = (value: Reply) =>
  queryClient.fetchQuery({
    queryKey: KEY,
    staleTime: 0,
    queryFn: () => Promise.resolve(value),
  });

describe("the saved marks on the query cache", () => {
  it("a reply asked for after the save, without the module, forgets the mark", async () => {
    await fetchNow(reply());
    save();
    await fetchNow(reply("samba"));
    expect(kept).toBe(true);
    await fetchNow(reply("ssh"));
    expect(kept).toBe(false);
  });

  it("a reply asked for before the save and landing after it forgets nothing", async () => {
    await fetchNow(reply());
    const stale = fetchHeld();
    save();
    await stale.answer(reply());
    expect(queryClient.getQueryData(KEY)).toEqual(reply());
    expect(kept).toBe(true);
    await fetchNow(reply());
    expect(kept).toBe(false);
  });

  it("a write into the cache by the app is not a reading", async () => {
    save();
    queryClient.setQueryData(KEY, reply());
    expect(kept).toBe(true);
  });

  it("an entry removed while its fetch was on its way does not hold the marks up", async () => {
    await fetchNow(reply());
    void fetchHeld();
    queryClient.removeQueries({ queryKey: KEY });
    save();
    await fetchNow(reply());
    expect(kept).toBe(false);
  });

  it("knows a fetch already on its way when it connects", async () => {
    disconnect();
    const stale = fetchHeld();
    disconnect = connectSavedMarks(queryClient, marks);
    save();
    await stale.answer(reply());
    expect(kept).toBe(true);
    await fetchNow(reply());
    expect(kept).toBe(false);
  });

  it("follows only the pending-modules entry", async () => {
    save();
    await queryClient.fetchQuery({
      queryKey: ["/rpc/Config/isDirty"],
      queryFn: () => Promise.resolve(reply()),
    });
    expect(kept).toBe(true);
  });
});
