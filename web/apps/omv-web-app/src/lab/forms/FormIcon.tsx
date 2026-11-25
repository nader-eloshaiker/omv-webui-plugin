// SPDX-License-Identifier: GPL-3.0-or-later
// The form prototypes' icons: development only (UI-11). Objects and actions come from the library's
// own set (`Icon`, `IconPlate`; rethink spec 5.3 and 5.4). The set has no equivalent yet for the
// few names in FALLBACK, which stay on lucide until it does:
//   administrator (a person with a shield plane), give-access (key into the object), and the form
//   furniture: info, warning, error, help, tip, takes-effect, check, close, reveal, conceal, suggest.
import type { IconName } from "@omv-webui/react-ui-components";
import { Icon, IconPlate } from "@omv-webui/react-ui-components";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  CircleAlert,
  CircleHelp,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lightbulb,
  MousePointerClick,
  ShieldUser,
  TriangleAlert,
  WandSparkles,
  X,
} from "lucide-react";

/** Library icons, some with the create mark (an object plus its action, 5.4). */
const FROM_SET = {
  "shared-folder": { name: "shared-folder" },
  "file-system": { name: "file-system" },
  person: { name: "person" },
  group: { name: "group" },
  nas: { name: "nas" },
  smb: { name: "service-smb" },
  nfs: { name: "service-nfs" },
  ssh: { name: "service-ssh" },
  "create-shared-folder": { name: "shared-folder", mark: "create" },
  "add-person": { name: "person", mark: "create" },
} as const satisfies Record<string, { name: IconName; mark?: "create" }>;

const FALLBACK = {
  administrator: ShieldUser,
  "give-access": KeyRound,
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

export type FormIconName = keyof typeof FROM_SET | keyof typeof FALLBACK;

function fromSet(
  name: FormIconName,
): { name: IconName; mark?: "create" } | null {
  return name in FROM_SET ? FROM_SET[name as keyof typeof FROM_SET] : null;
}

/** One icon, decorative: the words beside it carry the meaning. Still in a list (motion none). */
export function FormIcon({
  name,
  size = 16,
  className,
}: {
  name: FormIconName;
  size?: 16 | 20 | 24;
  className?: string;
}) {
  const set = fromSet(name);
  if (set) {
    return (
      <Icon
        name={set.name}
        mark={"mark" in set ? set.mark : undefined}
        size={size}
        motion="none"
        className={className}
      />
    );
  }
  const Glyph = FALLBACK[name as keyof typeof FALLBACK];
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

/** The 32px title plate, from the library, for a form's title (3.1). */
export function FormPlate({ name }: { name: FormIconName }) {
  const set = fromSet(name);
  if (!set) {
    return null;
  }
  return "mark" in set ? (
    <IconPlate name={set.name} mark={set.mark} />
  ) : (
    <IconPlate name={set.name} />
  );
}
