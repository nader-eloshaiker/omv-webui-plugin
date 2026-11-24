// SPDX-License-Identifier: GPL-3.0-or-later
// The accent candidates (a proposal for the owner, not shipped tokens): one small screen, drawn once
// per candidate, with the candidate applied to its subtree by `data-accent` (accent-candidates.css),
// so every piece is the real component reading the real roles. Sky keeps the grounds, the selected
// tint, the mark, the live trace and usage; the accent takes the primary action, the one next step,
// the current navigation item's marker, the focus ring, the live key figure and links. The pending
// pill is there to show the accent does not fight the gold. The numbers are in
// `node tools/colour-audit.mjs accents`.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, HardDrive, House, Network, Share2 } from "lucide-react";
import * as React from "react";
import { Button } from "../components/button/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/card/card";
import { Checkbox } from "../components/checkbox/checkbox";
import {
  Field,
  FieldControl,
  FieldHint,
  FieldLabel,
} from "../components/field/field";
import { LiveFigure } from "../components/live-figure/live-figure";
import { PendingPill } from "../components/pending-pill/pending-pill";
import { Sparkline } from "../components/sparkline/sparkline";
import { StatusPill } from "../components/status/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/table/table";
import { TopBar } from "../components/top-bar/top-bar";
import {
  INTERVAL_MS,
  mibPerSecond,
  toMiB,
  trafficSamples,
} from "../fixtures/live-samples";
import { cn } from "../utils";
import "./accent-candidates.css";
import { Hex } from "./palette-kit";

type CandidateId = "iris" | "cobalt" | "glacier" | "today";

const CANDIDATES: Record<
  CandidateId,
  { name: string; place: string; why: string }
> = {
  iris: {
    name: "Iris",
    place: "Ultramarine-violet, hue 276",
    why: "Next to Sky on the violet side: plainly another colour from the brand in both themes, at nearly twice its saturation, and far from every state.",
  },
  cobalt: {
    name: "Cobalt",
    place: "Electric blue, hue 258",
    why: "Sky turned toward the screen's purest blue: the closest match to the brand, and loud as a button, but its words in dark are close to Sky's.",
  },
  glacier: {
    name: "Glacier",
    place: "Electric cyan, hue 218",
    why: "Sky turned toward cyan: a light fill with navy words, like the gold, edged in petrol in light. In dark it sits close to the live trace.",
  },
  today: {
    name: "Today",
    place: "Sky, hue 240",
    why: "What ships now: the action, the brand, the trace and the selection are one blue, so nothing stands out.",
  },
};

const ORDER: readonly CandidateId[] = ["iris", "cobalt", "glacier"];

const traffic = trafficSamples(30);
const rxNow = toMiB(traffic.at(-1)?.interfaces.get("eth0")?.rx) ?? null;
const oneDecimal = (v: number) => v.toFixed(1);

// The primary button takes the accent's edge as its border: the fill itself for Iris and Cobalt in
// light, a lighter rim in dark, Glacier's petrol in light. A story-only class, until a token exists.
const edge = "border-(--theme-action-edge)";

/** The mark, drawn here in the brand (`text-brand`) so it stays Sky whatever the accent is. */
function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-control bg-selected text-brand shadow-control"
      >
        <HardDrive className="size-4" />
      </span>
      <span className="truncate text-section">openmediavault</span>
    </span>
  );
}

const NAV = [
  { label: "Dashboard", icon: House, current: true },
  { label: "Storage", icon: HardDrive, current: false },
  { label: "Shared folders", icon: Share2, current: false },
  { label: "Network", icon: Network, current: false },
] as const;

/** The current item: Sky's selected tint, ink words, and the accent as its leading marker. */
function MiniNav({ label }: { label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-0.5">
        {NAV.map(({ label: item, icon: Icon, current }) => (
          <li key={item}>
            <a
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "relative flex min-h-control items-center gap-2 rounded-control px-2.5 text-sm text-muted-foreground no-underline hover:bg-muted-strong hover:text-foreground",
                "aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
                "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:start-0 aria-[current=page]:before:w-0.75 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-(--theme-action-edge) aria-[current=page]:before:content-['']",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{item}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const DISKS = [
  { device: "/dev/sda", size: "3.6 TiB", status: "ok", word: "OK" },
  { device: "/dev/sdb", size: "3.6 TiB", status: "warning", word: "Warning" },
  { device: "/dev/sdc", size: "465.8 GiB", status: "ok", word: "OK" },
] as const;

/** The swatches of one candidate, read back from what the browser painted in its subtree. */
function Swatches() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      <Hex bg="bg-primary" />
      <Hex bg="bg-(--theme-action-label)" />
      <Hex bg="bg-(--theme-action-tint)" />
    </span>
  );
}

function MiniScreen({ id }: { id: CandidateId }) {
  const { name, place, why } = CANDIDATES[id];
  const nameId = React.useId();
  return (
    <section
      data-accent={id}
      aria-labelledby={nameId}
      className="@container flex min-w-0 flex-col gap-4 rounded-card bg-page p-4 ring-1 ring-border"
    >
      <div className="flex flex-col gap-1">
        <h2 id={nameId} className="text-section text-foreground">
          {name}{" "}
          <span className="text-sm font-normal text-tertiary-foreground">
            {place}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{why}</p>
        <Swatches />
      </div>

      <div className="-mx-4 border-y border-border">
        <TopBar
          className="static"
          brand={<Brand />}
          pending={
            <PendingPill count={2} label="2 pending changes" word="pending" />
          }
          user={
            <Button variant="quiet" size="sm">
              admin
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 @lg:grid-cols-[10rem_minmax(0,1fr)]">
        <MiniNav label={`Sections, ${name}`} />

        <div className="flex min-w-0 flex-col gap-4">
          {/* The hero: the one headline answer and the page's primary action. */}
          <div className="flex flex-col items-start gap-3">
            <p className="text-display text-foreground">
              Your NAS is ready to share files
            </p>
            <p className="text-muted-foreground">
              Two disks are set up and healthy. Make a shared folder so the
              computers on your network can use them.
            </p>
            <Button className={edge}>Create a shared folder</Button>
          </div>

          {/* The attention card and its one next step. */}
          <Card tone="warning">
            <CardHeader>
              <CardTitle level={3}>Disk sdb is running warm</CardTitle>
              <StatusPill status="warning">Warning</StatusPill>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                It is at 47&nbsp;°C, above the 45&nbsp;°C you set. Check that
                nothing blocks the air vents.
              </p>
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-(--theme-action-tint) px-2.5 py-0.5 text-xs font-semibold text-action-label">
                Next step
              </span>
              <Button size="sm" className={cn("self-start", edge)}>
                Run a health check
                <ArrowRight aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>

          {/* The live reading: the key figure in the accent, the trace in Sky beside it. */}
          <div className="flex items-center gap-4 rounded-card p-card surface-raised">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm text-muted-foreground">
                Network in · eth0
              </span>
              <LiveFigure
                value={rxNow}
                format={oneDecimal}
                unit="MiB/s"
                missing="No reading"
                className="text-action-label"
              />
            </div>
            <Sparkline
              data={traffic}
              value={(s) => toMiB(s.interfaces.get("eth0")?.rx)}
              intervalMs={INTERVAL_MS}
              describe={({ now, peak }) =>
                now === null
                  ? "Network in: no reading yet"
                  : `Network in: ${mibPerSecond(now)} now, peak ${mibPerSecond(peak ?? now)}`
              }
              className="min-w-0 flex-1"
            />
          </div>

          {/* A small form: the primary Save, a neutral Cancel, and the pending pill it leads to. */}
          <form
            aria-label={`Shared folder, ${name}`}
            className="flex flex-col gap-3 rounded-card p-card surface-raised"
            onSubmit={(event) => event.preventDefault()}
          >
            <Field>
              <FieldLabel>Shared folder name</FieldLabel>
              <FieldControl defaultValue="photos" />
              <FieldHint>
                Clients reach it at \\NAS_HOST\photos.{" "}
                <a
                  href="#connect"
                  className="rounded-sm text-action-label underline underline-offset-2 hover:no-underline"
                >
                  How to connect from Windows
                </a>
              </FieldHint>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="pending">Saved, not applied yet</StatusPill>
              <span className="ms-auto flex gap-2">
                <Button variant="neutral">Cancel</Button>
                {/* Drawn focused, so the ring can be compared without a keyboard. */}
                <Button
                  type="submit"
                  className={cn(
                    edge,
                    "outline-2 outline-offset-2 outline-ring",
                  )}
                >
                  Save
                </Button>
              </span>
            </div>
          </form>

          {/* A table row selected (Sky's tint and its checked box), with its row action. */}
          <Table aria-label={`Disks, ${name}`}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0">
                  <span className="sr-only">Selected</span>
                </TableHead>
                <TableHead>Disk</TableHead>
                <TableHead numeric>Size</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DISKS.map((disk) => {
                const selected = disk.device === "/dev/sdb";
                return (
                  <TableRow key={disk.device} selected={selected}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${disk.device}`}
                        defaultChecked={selected}
                      />
                    </TableCell>
                    <TableCell mono>{disk.device}</TableCell>
                    <TableCell numeric>{disk.size}</TableCell>
                    <TableCell>
                      <StatusPill status={disk.status}>{disk.word}</StatusPill>
                    </TableCell>
                    <TableCell className="text-end">
                      {selected ? (
                        <Button variant="ghost" size="sm">
                          Details
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

interface Args {
  /** All three candidates side by side, or one of them, or what ships today. */
  candidate: "all" | CandidateId;
}

const meta = {
  title: "Foundations/Accent candidates",
  args: { candidate: "all" },
  argTypes: {
    candidate: {
      control: "select",
      options: ["all", ...ORDER, "today"],
    },
  },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/**
 * The same small screen in each candidate. The three sit side by side when the panel is wide (the
 * toolbar's single layout); in the four-panel matrix they stack. `candidate` picks one, or `today`.
 */
export const Compare: Story = {
  render: ({ candidate }) => (
    <div className="@container">
      <div
        className={cn(
          "grid gap-gutter",
          candidate === "all" && "@5xl:grid-cols-3",
        )}
      >
        {(candidate === "all" ? ORDER : [candidate]).map((id) => (
          <MiniScreen key={id} id={id} />
        ))}
      </div>
    </div>
  ),
};
