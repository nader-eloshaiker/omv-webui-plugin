// SPDX-License-Identifier: GPL-3.0-or-later
// The two settings of a file system's mount (phase 5 file-systems design 2.6), shared by its page, the
// mount dialog and Flow A: "Warn when it is this full" (the classic interface's choices; a saved value
// outside them stays a choice of its own, "set elsewhere") and "Tags". Labels above, hints below.
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@omv-webui/react-ui-components";
import { useId, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { LEVELS, levelChoices } from "../../filesystems/fsModel.ts";

export function LevelField({
  value,
  saved = value,
  onChange,
  readOnly,
  triggerRef,
}: {
  value: number;
  /** The saved level: when it is not one of the choices it is offered as "set elsewhere". */
  saved?: number;
  onChange: (level: number) => void;
  readOnly?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const word = (level: number) =>
    level === 0
      ? t("filesystem.settings.levelOff")
      : (LEVELS as readonly number[]).includes(level)
        ? `${String(level)}%`
        : t("filesystem.settings.levelElsewhere", { value: level });
  const choices = [
    ...new Set([...levelChoices(saved), ...levelChoices(value)]),
  ].sort((a, b) => a - b);
  const items = choices.map((level) => ({
    value: String(level),
    label: word(level),
  }));
  return (
    <div className="flex max-w-sm flex-col gap-1">
      <Select
        items={items}
        value={String(value)}
        readOnly={readOnly}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectLabel>{t("filesystem.settings.level")}</SelectLabel>
        <SelectTrigger ref={triggerRef} aria-describedby={hintId} />
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t("filesystem.settings.levelHint")}
      </p>
    </div>
  );
}

export function TagsField({
  value,
  onChange,
  readOnly,
  tooLong,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (text: string) => void;
  readOnly?: boolean;
  /** The text is longer than the server keeps: said in words. */
  tooLong?: boolean;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  return (
    <Field invalid={tooLong ? true : undefined} className="max-w-[40rem]">
      <FieldLabel>{t("filesystem.settings.tags")}</FieldLabel>
      <FieldControl
        ref={inputRef}
        autoComplete="off"
        dir="auto"
        readOnly={readOnly}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldHint>{t("filesystem.settings.tagsHint")}</FieldHint>
      {tooLong ? (
        <FieldError match>{t("filesystem.settings.tagsTooLong")}</FieldError>
      ) : null}
    </Field>
  );
}
