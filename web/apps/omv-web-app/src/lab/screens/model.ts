// SPDX-License-Identifier: GPL-3.0-or-later
// Derived values for the lab's screens: development only (UI-11).
import type { Disk, NasState, Status } from "../data.ts";
import { percent, STATUS_WORD, worst } from "../data.ts";
import type { Sample } from "../live.ts";
import { SAMPLE_MS, useSamples } from "../live.ts";

export function niceMax(v: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find((s) => s >= v * 1.15) ?? 1000;
}

export function health(nas: NasState) {
  const diskState = worst(nas.disks.map((d) => d.status));
  const fsState = worst(nas.fileSystems.map((f) => f.status));
  const needs = nas.attention.filter((a) => a.status !== "setup");
  const overall = worst([diskState, fsState]);
  return {
    overall,
    diskState,
    fsState,
    needs,
    headline:
      needs.length === 0
        ? overall === "unknown"
          ? "No problems found"
          : "Everything is OK"
        : `${needs.length} ${needs.length === 1 ? "thing needs" : "things need"} your attention`,
  };
}

export function countBy(disks: { status: Status }[]): string {
  const counts = (["critical", "warning", "unknown", "ok"] as const)
    .map((s) => [s, disks.filter((d) => d.status === s).length] as const)
    .filter(([, n]) => n > 0);
  return counts.map(([s, n]) => `${n} ${STATUS_WORD[s]}`).join(" · ");
}

/** Every card can show its loading state: same size, content hidden, a quiet skeleton. */
export function useLiveFigures() {
  const samples = useSamples();
  const latest = samples.at(-1) as Sample;
  const pick = (f: (s: Sample) => number) => samples.map(f);
  const rx = pick((s) => s.rxMiB);
  const tx = pick((s) => s.txMiB);
  return {
    samples,
    latest,
    cpu: pick((s) => s.cpu),
    mem: pick((s) => s.memGiB),
    rx,
    tx,
    temp: pick((s) => s.cpuTemp),
    netMax: niceMax(Math.max(...rx, ...tx)),
    // The span actually sampled, not the window's capacity: honest while the page fills it.
    seconds: Math.round(((samples.length - 1) * SAMPLE_MS) / 1000),
  };
}

export function sparkLabel(
  name: string,
  values: number[],
  unit: string,
): string {
  const now = values.at(-1) ?? 0;
  const top = Math.max(...values);
  return `${name}, sampled while this page is open: now ${now.toFixed(0)} ${unit}, highest ${top.toFixed(0)} ${unit}.`;
}

export function diskFor(nas: NasState, id: string): Disk | undefined {
  return nas.disks.find((d) => d.id === id);
}

export interface FlowNode {
  id: string;
  label: string;
  sub: string;
  status: Status;
  links: string[];
  kind?: string;
  off?: boolean;
  onOpen?: () => void;
}

export function storageFlow(
  nas: NasState,
  open: (target: "folder") => void,
  withServices: boolean,
) {
  const disks: FlowNode[] = nas.disks.map((d) => ({
    id: `d-${d.id}`,
    label: d.device,
    sub: `${d.size}${d.temp ? ` · ${d.temp}\u00a0°C` : ""}`,
    status: d.status,
    links: [`f-${d.fs}`],
    kind: "disk",
  }));
  const fss: FlowNode[] = nas.fileSystems.map((f) => ({
    id: `f-${f.id}`,
    label: f.label,
    sub: `${percent(f.usedTiB, f.sizeTiB)}% full · ${f.type}`,
    status: f.status,
    links: f.folders.map((x) => `s-${x}`),
    kind: "fs",
  }));
  const folders: FlowNode[] = nas.folders.map((s) => ({
    id: `s-${s.id}`,
    label: s.name,
    sub: s.smb ? "Windows and Mac" : s.nfs ? "Linux and Unix" : "Not shared",
    status: "ok",
    links: withServices
      ? [s.smb ? "x-smb" : "", s.nfs ? "x-nfs" : ""].filter(Boolean)
      : [],
    kind: "folder",
    onOpen:
      s.id === "photos"
        ? () => {
            open("folder");
          }
        : undefined,
  }));
  const columns = [
    { title: "Disks", nodes: disks },
    { title: "File systems", nodes: fss },
    { title: "Shared folders", nodes: folders },
  ];
  if (withServices) {
    columns.push({
      title: "Shared with",
      nodes: [
        {
          id: "x-smb",
          label: "Windows and Mac",
          sub: "SMB · running",
          status: "ok",
          links: [],
          kind: "svc",
        },
        {
          id: "x-nfs",
          label: "Linux and Unix",
          sub: "NFS · running",
          status: "ok",
          links: [],
          kind: "svc",
        },
      ],
    });
  }
  return columns;
}
