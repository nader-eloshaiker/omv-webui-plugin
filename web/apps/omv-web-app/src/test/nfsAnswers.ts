// SPDX-License-Identifier: GPL-3.0-or-later
// Remembering NFS answers for the page tests (phase 5 services design 1, 2): the settings, the
// entries and the `nfs` row of Services.getStatus, in the shapes the captures show (NFS.setSettings
// replies with the versions as one string, NFS.deleteShare with an empty list). Every write is checked
// against the contract's request schema first and refused with a 500 when it does not match, so a
// test sees a malformed body fail. Writes mark `nfs` and `avahi` pending in the mock session (the VM's
// sets), which System.getInformation then reports.
import {
  NfsSetSettingsRequestSchema,
  NfsSetShareRequestSchema,
} from "@omv-webui/react-api-omv/forms";
import type { NfsShareRow } from "@omv-webui/react-api-omv/generated";
import type { Answers, FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import type { MockSession } from "../mocks/scenarios.ts";

const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

export interface NfsMockState {
  enable: boolean;
  versions: string[];
  shares: NfsShareRow[];
  /** Whether the NFS service runs (Services.getStatus's `running`). */
  running: boolean;
  /** Folder names by UUID, for `sharedfoldername` of a new entry. */
  names: Record<string, string>;
  /** Answer NFS.getShareList with this failure instead. */
  listFails?: FixedAnswer;
  /** Answer NFS.setShare with this failure instead. */
  setShareFails?: FixedAnswer;
  /** Answer NFS.setSettings with this failure instead. */
  setSettingsFails?: FixedAnswer;
}

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (message: string): FixedAnswer => ({ status: 500, message });
const clone = <T>(value: T): T => structuredClone(value);

function schemaProblem(
  schema: typeof NfsSetShareRequestSchema | typeof NfsSetSettingsRequestSchema,
  value: unknown,
): string | null {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    return "async";
  }
  return result.issues === undefined
    ? null
    : `contract refused: ${result.issues.map((i) => i.message).join("; ")}`;
}

/** An entry in the captured shape, for a test's starting state. */
export function nfsEntry(
  n: number,
  folderUuid: string,
  folderName: string,
  over: Partial<NfsShareRow> = {},
): NfsShareRow {
  return {
    uuid: `00000000-0000-4000-8000-${(0x500 + n).toString(16).padStart(12, "0")}`,
    sharedfolderref: folderUuid,
    mntentref: `00000000-0000-4000-8000-${(0x600 + n).toString(16).padStart(12, "0")}`,
    client: "192.0.2.10",
    options: "rw",
    comment: "",
    extraoptions: "subtree_check,insecure",
    sharedfoldername: folderName,
    ...over,
  };
}

export function nfsMock(start: Partial<NfsMockState> = {}) {
  const state: NfsMockState = {
    enable: true,
    versions: ["3", "4", "4.1", "4.2"],
    shares: [],
    running: true,
    names: {},
    ...start,
  };
  let session: MockSession | undefined;
  let next = 0x700;
  const dirty = (modules: readonly string[]) => {
    if (session !== undefined) {
      session.fsDirty = {
        ...session.fsDirty,
        ...Object.fromEntries(modules.map((m) => [m, `${m} module.`])),
      };
    }
  };

  const answers: Answers = {
    nfsGetSettings: () =>
      ok({ enable: state.enable, versions: [...state.versions], shares: "" }),
    nfsSetSettings: ({ params }) => {
      const problem = schemaProblem(NfsSetSettingsRequestSchema, params);
      if (problem !== null) {
        return fail(problem);
      }
      if (state.setSettingsFails !== undefined) {
        return state.setSettingsFails;
      }
      const body = params as { enable: boolean; versions: string[] };
      state.enable = body.enable;
      state.versions = [...body.versions];
      dirty(["nfs", "avahi"]);
      return ok({ enable: state.enable, versions: state.versions.join(",") });
    },
    nfsGetShareList: () =>
      state.listFails ??
      ok({ total: state.shares.length, data: clone(state.shares) }),
    nfsGetShare: ({ params }) => {
      const { uuid } = params as { uuid: string };
      const found = state.shares.find((s) => s.uuid === uuid);
      if (found === undefined) {
        return fail(`Object not found (uuid=${uuid}).`);
      }
      const { sharedfoldername: _name, ...stored } = found;
      return ok(clone(stored));
    },
    nfsSetShare: ({ params }) => {
      const problem = schemaProblem(NfsSetShareRequestSchema, params);
      if (problem !== null) {
        return fail(problem);
      }
      if (state.setShareFails !== undefined) {
        return state.setShareFails;
      }
      const body = params as Omit<NfsShareRow, "sharedfoldername">;
      if (body.uuid === NEW_OBJECT) {
        next += 1;
        const first = !state.shares.some(
          (s) => s.sharedfolderref === body.sharedfolderref,
        );
        const row: NfsShareRow = {
          ...body,
          uuid: `00000000-0000-4000-8000-${next.toString(16).padStart(12, "0")}`,
          mntentref: `00000000-0000-4000-8000-${(next + 0x100).toString(16).padStart(12, "0")}`,
          sharedfoldername: state.names[body.sharedfolderref] ?? "Unknown",
        };
        state.shares.push(row);
        dirty(first ? ["nfs", "avahi", "fstab"] : ["nfs", "avahi"]);
        const { sharedfoldername: _name, ...stored } = row;
        return ok(stored);
      }
      const index = state.shares.findIndex((s) => s.uuid === body.uuid);
      const current = state.shares[index];
      if (current === undefined) {
        return fail(`Object not found (uuid=${body.uuid}).`);
      }
      state.shares[index] = {
        ...body,
        sharedfoldername: current.sharedfoldername,
      };
      dirty(["nfs"]);
      return ok(clone(body));
    },
    nfsDeleteShare: ({ params }) => {
      const { uuid } = params as { uuid: string };
      const removed = state.shares.find((s) => s.uuid === uuid);
      if (removed === undefined) {
        return fail(`Object not found (uuid=${uuid}).`);
      }
      state.shares = state.shares.filter((s) => s.uuid !== uuid);
      dirty(["nfs", "avahi"]);
      return ok([]);
    },
  };

  /** Services.getStatus with the `nfs` row as this state says; for the NFS page. */
  const servicesGetStatus: Answers["servicesGetStatus"] = () =>
    ok({
      total: 2,
      data: [
        {
          name: "nfs",
          title: "NFS",
          enabled: state.enable,
          running: state.enable && state.running,
        },
        { name: "ssh", title: "SSH", enabled: true, running: true },
      ],
    });

  return {
    state,
    answers,
    servicesGetStatus,
    /** The mock session a write marks pending in (renderApp's `mock`). */
    attach(mock: MockSession) {
      session = mock;
    },
  };
}
