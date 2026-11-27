// SPDX-License-Identifier: GPL-3.0-or-later
// The icon sheet (rethink 8, prototype 6): every icon of the custom set at 16, 20 and 24 and on the
// 32px plate, beside the nearest lucide glyph at the same size for the stroke comparison (1.75px
// against lucide's 2 at 24, so objects read apart from controls); the badges; the icons on the
// accent primary button and on plain ones; and each action icon acting out its action (7.7) with a
// replay of its success. Every panel of the matrix is one theme and one density.
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Activity,
  Check,
  Columns2,
  Copy,
  Database,
  Disc3,
  Eraser,
  EthernetPort,
  FolderOpen,
  FolderSync,
  HardDrive,
  HardDriveDownload,
  HardDriveUpload,
  type LucideIcon,
  MemoryStick,
  Merge,
  Monitor,
  Moon,
  Network,
  PcCase,
  Puzzle,
  RotateCw,
  Server,
  Share2,
  SquarePlus,
  Sun,
  Tag,
  Terminal,
  Undo2,
  Usb,
  User,
  Users,
  Waves,
  Wifi,
} from "lucide-react";
import * as React from "react";
import { Button } from "../button/button";
import {
  ACTION_ICON_NAMES,
  type ActionIconName,
  Icon,
  type IconBadgeStatus,
  type IconName,
  IconPlate,
  OBJECT_ICON_NAMES,
} from "./icon";

const meta = {
  title: "Components/Icon",
  component: Icon,
  args: { name: "shared-folder", size: 20 },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each icon's plain name, as the catalogue would give it for a tooltip and a lone icon's label. */
const NAMES: Record<IconName, string> = {
  "disk-hdd": "Hard disk",
  "disk-ssd": "SSD",
  "disk-nvme": "NVMe drive",
  "disk-usb": "USB disk",
  "disk-optical": "CD or DVD drive",
  disk: "Disk",
  "file-system": "Storage (file system)",
  "raid-array": "RAID array",
  "zfs-pool": "ZFS pool",
  "shared-folder": "Shared folder",
  person: "Person",
  group: "Group",
  "service-smb": "Windows and Mac sharing (SMB)",
  "service-nfs": "Linux and Unix sharing (NFS)",
  "service-rsync": "Rsync server",
  "service-ssh": "SSH",
  "net-ethernet": "Network port (Ethernet)",
  "net-wifi": "Wi-Fi",
  "net-bond": "Bond",
  "net-vlan": "VLAN",
  "net-bridge": "Bridge",
  "copy-job": "Copy job",
  plugin: "Add-on",
  nas: "This NAS",
  create: "Create",
  share: "Share",
  mount: "Mount",
  unmount: "Unmount",
  mirror: "Make a mirror",
  wipe: "Wipe",
  apply: "Apply",
  undo: "Undo",
  "check-health": "Check health",
  sleep: "Sleep",
  wake: "Wake",
  restart: "Restart",
};

/** The nearest lucide glyph, for the stroke comparison only: the interface glyphs stay lucide. */
const LUCIDE: Record<IconName, LucideIcon> = {
  "disk-hdd": HardDrive,
  "disk-ssd": HardDrive,
  "disk-nvme": MemoryStick,
  "disk-usb": Usb,
  "disk-optical": Disc3,
  disk: HardDrive,
  "file-system": Database,
  "raid-array": Columns2,
  "zfs-pool": Waves,
  "shared-folder": FolderOpen,
  person: User,
  group: Users,
  "service-smb": Monitor,
  "service-nfs": PcCase,
  "service-rsync": FolderSync,
  "service-ssh": Terminal,
  "net-ethernet": EthernetPort,
  "net-wifi": Wifi,
  "net-bond": Merge,
  "net-vlan": Tag,
  "net-bridge": Network,
  "copy-job": Copy,
  plugin: Puzzle,
  nas: Server,
  create: SquarePlus,
  share: Share2,
  mount: HardDriveDownload,
  unmount: HardDriveUpload,
  mirror: Columns2,
  wipe: Eraser,
  apply: Check,
  undo: Undo2,
  "check-health": Activity,
  sleep: Moon,
  wake: Sun,
  restart: RotateCw,
};

const SIZES = [16, 20, 24] as const;
const LUCIDE_SIZE = { 16: "size-4", 20: "size-5", 24: "size-6" } as const;

function SheetRow({ name }: { name: IconName }) {
  const Glyph = LUCIDE[name];
  return (
    <tr className="border-t border-border">
      <th
        scope="row"
        className="py-2 pe-4 text-start text-sm font-normal text-foreground"
      >
        {NAMES[name]}
        <span className="block font-mono text-xs text-tertiary-foreground">
          {name}
        </span>
      </th>
      {SIZES.map((size) => (
        <td key={size} className="px-2 py-2 text-foreground">
          <Icon name={name} size={size} />
        </td>
      ))}
      <td className="px-2 py-2">
        <IconPlate name={name} />
      </td>
      {SIZES.map((size) => (
        <td key={size} className="px-2 py-2 text-muted-foreground">
          <Glyph aria-hidden="true" className={LUCIDE_SIZE[size]} />
        </td>
      ))}
    </tr>
  );
}

function SheetTable({
  caption,
  names,
}: {
  caption: string;
  names: readonly IconName[];
}) {
  return (
    <table className="w-max border-collapse">
      <caption className="pb-2 text-start text-section text-foreground">
        {caption}
      </caption>
      <thead>
        <tr className="text-xs text-tertiary-foreground">
          <th scope="col" className="pe-4 text-start font-medium">
            Icon
          </th>
          {SIZES.map((size) => (
            <th key={size} scope="col" className="px-2 text-start font-medium">
              {size}
            </th>
          ))}
          <th scope="col" className="px-2 text-start font-medium">
            Plate 32
          </th>
          {SIZES.map((size) => (
            <th key={size} scope="col" className="px-2 text-start font-medium">
              lucide {size}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {names.map((name) => (
          <SheetRow key={name} name={name} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * The sheet: every object (5.3) and every action (5.4) at each size and on its plate, with the
 * nearest lucide glyph in secondary ink for the stroke comparison.
 */
export const Sheet: Story = {
  name: "Icons",
  render: () => (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
      <SheetTable caption="Things on the NAS" names={OBJECT_ICON_NAMES} />
      <SheetTable caption="Things done to them" names={ACTION_ICON_NAMES} />
    </div>
  ),
};

const BADGES: readonly { badge: IconBadgeStatus; word: string }[] = [
  { badge: "warning", word: "Warning" },
  { badge: "critical", word: "Critical" },
  { badge: "unknown", word: "Not checked yet" },
  { badge: "pending", word: "Saved, not applied" },
  { badge: "ok", word: "OK (only when a state changes)" },
];

/** A state changing on an object: the badge's new shape crossfades in from 0.9 (7.7). */
function ChangingBadge() {
  const [badge, setBadge] = React.useState<IconBadgeStatus>("warning");
  const next = badge === "warning" ? "ok" : "warning";
  return (
    <div className="flex items-center gap-3">
      <Icon name="disk-hdd" size={24} badge={badge} />
      <span className="text-sm text-foreground">
        Disk in bay 2: {badge === "warning" ? "Warning" : "OK"}
      </span>
      <Button variant="neutral" size="sm" onClick={() => setBadge(next)}>
        {badge === "warning" ? "Resolve the warning" : "Raise a warning"}
      </Button>
    </div>
  );
}

/**
 * Status and pending badges, cut out of the drawing at the bottom right in their own shapes, always
 * with the word beside them; and an object's create mark.
 */
export const Badges: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {BADGES.map(({ badge, word }) => (
          <li key={badge} className="flex items-center gap-3">
            {SIZES.map((size) => (
              <Icon key={size} name="shared-folder" size={size} badge={badge} />
            ))}
            <Icon name="disk-nvme" size={24} badge={badge} />
            <Icon name="person" size={24} badge={badge} />
            <span className="text-sm text-muted-foreground">{word}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        {SIZES.map((size) => (
          <Icon key={size} name="person" size={size} mark="create" />
        ))}
        <IconPlate name="shared-folder" mark="create" />
        <span className="text-sm text-muted-foreground">
          Add a person, add a shared folder: the object with the create mark
        </span>
      </div>
      <ChangingBadge />
    </div>
  ),
};

/**
 * On the accent's primary button the whole icon is the button's ink, its plane a tint over the
 * Cobalt (A5); on a plain, neutral or ghost button the icon is ink, never the accent. Hover a
 * button to see its icon act.
 */
export const OnButtons: Story = {
  name: "On buttons",
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <Icon name="shared-folder" size={16} mark="create" />
          Create Photos
        </Button>
        <Button variant="neutral">Cancel</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <Icon name="person" size={16} mark="create" />
          Add alex
        </Button>
        <Button variant="primaryOutline">
          <Icon name="check-health" size={16} />
          Check disk sdb
        </Button>
        <Button variant="neutral">
          <Icon name="share" size={16} />
          Share Photos
        </Button>
        <Button variant="ghost">
          <Icon name="mount" size={16} />
          Mount Data drive
        </Button>
        <Button variant="plain" size="sm">
          <Icon name="restart" size={16} />
          Restart
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg">
          <Icon name="create" size={20} />
          Add storage
        </Button>
        <Button variant="neutral" size="lg">
          <Icon name="undo" size={20} />
          Discard 2 changes
        </Button>
        <Button disabled>
          <Icon name="apply" size={16} />
          Apply (unavailable: still)
        </Button>
      </div>
    </div>
  ),
};

/** What each motion is, in words (7.7): hover or focus, then success. */
const MOTIONS: Record<
  ActionIconName,
  { button: string; hover: string; done: string; variant?: "destructive" }
> = {
  create: {
    button: "Create Photos",
    hover: "The plus turns a quarter on the settle spring",
    done: "The plus becomes a check, drawn",
  },
  share: {
    button: "Share Photos",
    hover: "The ribbon slides out 2px",
    done: "The ribbon extends and settles",
  },
  mount: {
    button: "Mount Data drive",
    hover: "The arrow nudges into the socket",
    done: "The arrow goes in and the socket closes",
  },
  unmount: {
    button: "Unmount Data drive",
    hover: "The arrow nudges out of the socket",
    done: "The arrow lifts out and settles back",
  },
  mirror: {
    button: "Mirror two disks",
    hover: "The equals mark parts and closes (proposed)",
    done: "None",
  },
  wipe: {
    button: "Wipe sdb",
    hover: "Nothing: no playfulness on a destructive entry",
    done: "On the confirm button's arm, the three sweeps draw across in turn",
    variant: "destructive",
  },
  apply: {
    button: "Apply 2 changes",
    hover: "The check nudges toward the bar",
    done: "The check slides into the bar",
  },
  undo: {
    button: "Undo",
    hover: "The arrow turns back 30 degrees",
    done: "One quarter turn back",
  },
  "check-health": {
    button: "Check health",
    hover: "The pulse line traces once",
    done: "The pulse traces again; the result's badge and word follow",
  },
  sleep: {
    button: "Put sdb to sleep",
    hover: "The moon dips (proposed)",
    done: "None",
  },
  wake: {
    button: "Wake sdb",
    hover: "The rays reach out (proposed)",
    done: "The rays reach out once",
  },
  restart: {
    button: "Restart the NAS",
    hover: "The loop arrow turns a quarter",
    done: "Not shown: the page goes to the reconnect watch",
  },
};

/** Plays the success once: back to rest for a frame, then done, then rest again. */
function useReplay(): ["rest" | "done", () => void] {
  const [state, setState] = React.useState<"rest" | "done">("rest");
  const timerRef = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const replay = React.useCallback(() => {
    window.clearTimeout(timerRef.current);
    setState("rest");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setState("done");
        timerRef.current = window.setTimeout(() => setState("rest"), 1600);
      }),
    );
  }, []);
  return [state, replay];
}

function MotionRow({ name }: { name: ActionIconName }) {
  const { button, hover, done, variant } = MOTIONS[name];
  const [state, replay] = useReplay();
  const hasDone = done !== "None" && !done.startsWith("Not shown");
  return (
    <tr className="border-t border-border align-middle">
      <td className="py-2 pe-3">
        <Button variant={variant ?? "neutral"} size="sm">
          <Icon name={name} size={16} state={state} />
          {button}
        </Button>
      </td>
      <td className="py-2 pe-3">
        <Icon name={name} size={24} state={state} motion="none" />
      </td>
      <td className="py-2 pe-3 text-sm text-muted-foreground">{hover}</td>
      <td className="py-2 pe-3 text-sm text-muted-foreground">{done}</td>
      <td className="py-2">
        {hasDone ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={replay}
            aria-label={`Replay the success of ${NAMES[name]}`}
          >
            Replay
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Each action icon acting out its action (7.7): point at or tab to its button for the hover motion
 * (after an 80ms intent delay, once per hover-enter); Replay plays the success once. Under reduced
 * motion both land on their end state at once.
 */
export const ActionMotions: Story = {
  name: "Action motions",
  render: () => (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-start text-xs text-tertiary-foreground">
          <th scope="col" className="pe-3 text-start font-medium">
            On its button
          </th>
          <th scope="col" className="pe-3 text-start font-medium">
            24
          </th>
          <th scope="col" className="pe-3 text-start font-medium">
            Hover or focus
          </th>
          <th scope="col" className="pe-3 text-start font-medium">
            Success
          </th>
          <th scope="col" className="text-start font-medium">
            <span className="sr-only">Replay</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ACTION_ICON_NAMES.map((name) => (
          <MotionRow key={name} name={name} />
        ))}
      </tbody>
    </table>
  ),
};

/** A lone icon names itself (`label`); beside a word it is decorative. */
export const Labelled: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-foreground">
      <Icon name="net-wifi" size={24} label="Wi-Fi" />
      <Icon name="net-ethernet" size={24} label="Network port (Ethernet)" />
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Icon name="service-ssh" size={16} />
        SSH
      </span>
    </div>
  ),
};
