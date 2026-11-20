// SPDX-License-Identifier: GPL-3.0-or-later
// The appearance preference: the same as the device, light or dark. Stored as a preference only
// (UI-13). It moves into the user menu when the shell exists.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import {
  isThemePreference,
  THEME_PREFERENCES,
  useThemeStore,
} from "../../stores/useThemeStore.ts";

export function ThemeSelect() {
  const { t } = useTranslation();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const items = THEME_PREFERENCES.map((value) => ({
    value,
    label: t(`theme.${value}`),
  }));
  return (
    <Select
      items={items}
      value={preference}
      onValueChange={(value) => {
        if (isThemePreference(value)) {
          setPreference(value);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <SelectLabel className="text-sm font-regular text-muted-foreground">
          {t("theme.label")}
        </SelectLabel>
        <SelectTrigger className="w-auto min-w-44" />
      </div>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
