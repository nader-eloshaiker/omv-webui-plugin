// SPDX-License-Identifier: GPL-3.0-or-later
// The form prototypes' icons: development only (UI-11). Names follow the rethink spec's inventory
// (5.3 domain objects, 5.4 actions); until the library's own set lands, each name points at the
// nearest lucide glyph, so swapping to the custom set is this one file.
import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  FolderOutput,
  FolderPlus,
  HardDrive,
  Info,
  KeyRound,
  Lightbulb,
  Mail,
  Monitor,
  MousePointerClick,
  Server,
  ShieldUser,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  Tv,
  User,
  UserPlus,
  Users,
  WandSparkles,
  X,
} from "lucide-react";

const ICONS = {
  // 5.3 domain objects
  "shared-folder": FolderOutput,
  "file-system": HardDrive,
  person: User,
  administrator: ShieldUser,
  group: Users,
  smb: Monitor,
  nfs: Tv,
  ssh: SquareTerminal,
  nas: Server,
  "this-browser": AppWindow,
  email: Mail,
  // 5.4 actions
  "create-shared-folder": FolderPlus,
  "add-person": UserPlus,
  "give-access": KeyRound,
  "delete-with-data": Trash2,
  copy: Copy,
  // Form furniture
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  help: CircleHelp,
  tip: Lightbulb,
  "takes-effect": MousePointerClick,
  check: Check,
  close: X,
  reveal: Eye,
  conceal: EyeOff,
  suggest: WandSparkles,
} satisfies Record<string, LucideIcon>;

export type LabIconName = keyof typeof ICONS;

/** One icon by its inventory name. Decorative: the words beside it carry the meaning. */
export function LabIcon({
  name,
  size = 16,
  className,
}: {
  name: LabIconName;
  size?: 16 | 20 | 24 | 32;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      aria-hidden="true"
      width={size}
      height={size}
      strokeWidth={size >= 24 ? 1.6 : 1.8}
      className={className}
    />
  );
}
