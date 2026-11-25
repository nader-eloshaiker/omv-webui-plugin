// SPDX-License-Identifier: GPL-3.0-or-later
// The account menu in the top bar, as the guidance prototype needs it (rethink P.3, decision 3): the
// preferences side by side (Theme, Density, Show tips, Animations), then "Show me around" and
// "Sign out". It holds controls, so it is a button that opens a panel (aria-expanded, Escape closes
// and gives focus back), not a menu of commands. Development only (UI-11): the lab's static copy.
import type { SegmentedChoiceOption } from "@omv-webui/react-ui-components";
import { Button, SegmentedChoice } from "@omv-webui/react-ui-components";
import { CircleUser, LogOut, Play } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef } from "react";
import { ShowTipsSwitch } from "./parts/ShowTipsSwitch.tsx";

export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";
export type Motion = "full" | "reduced";

const THEMES: SegmentedChoiceOption<Theme>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const DENSITIES: SegmentedChoiceOption<Density>[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];
const MOTIONS: SegmentedChoiceOption<Motion>[] = [
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
];

function ChoiceRow<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div className="g-menu-row">
      <span className="g-menu-label" aria-hidden="true">
        {label}
      </span>
      <SegmentedChoice
        size="sm"
        aria-label={label}
        options={options}
        value={value}
        onValueChange={onChange}
      />
    </div>
  );
}

export function AccountMenu({
  open,
  onOpenChange,
  theme,
  onTheme,
  density,
  onDensity,
  motion,
  onMotion,
  onNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  density: Density;
  onDensity: (density: Density) => void;
  motion: Motion;
  onMotion: (motion: Motion) => void;
  onNote: (text: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onOpenChange]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      onOpenChange(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".g-account")?.focus();
    }
  };

  return (
    <div ref={rootRef} className="g-account-root" onKeyDown={onKeyDown}>
      <Button
        variant="plain"
        className="g-account"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          onOpenChange(!open);
        }}
      >
        <CircleUser aria-hidden="true" />
        <span className="g-account-name">admin</span>
        <span className="sr-only">, account and preferences</span>
      </Button>
      <section
        id={panelId}
        hidden={!open}
        className="g-menu"
        aria-label="Account and preferences"
      >
        <div className="g-menu-who">
          <p className="g-menu-name">admin</p>
          <p className="g-menu-role">Administrator of this NAS</p>
        </div>
        <div className="g-menu-prefs">
          <ChoiceRow
            label="Theme"
            options={THEMES}
            value={theme}
            onChange={onTheme}
          />
          <ChoiceRow
            label="Density"
            options={DENSITIES}
            value={density}
            onChange={onDensity}
          />
          <ShowTipsSwitch className="g-menu-switch" />
          <ChoiceRow
            label="Animations"
            options={MOTIONS}
            value={motion}
            onChange={onMotion}
          />
        </div>
        <div className="g-menu-actions">
          <Button
            variant="plain"
            size="sm"
            onClick={() => {
              onNote("Show me around replays the dashboard's first visit.");
            }}
          >
            <Play aria-hidden="true" />
            Show me around
          </Button>
          <Button
            variant="plain"
            size="sm"
            onClick={() => {
              onNote("Sign out ends the session.");
            }}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
