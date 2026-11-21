// SPDX-License-Identifier: GPL-3.0-or-later
// A RAID flow's step labels, as its step list says them (phase 5 RAID design 3.4, 4.5): Flow A's words
// for the file-system stage, the RAID slice's for the rest, and the checkpoint labelled by what it does.
import { useTranslation } from "react-i18next";
import { targetDevice, type PlanStep, type RaidRun } from "../raid/raidRun.ts";
import { useFsWords } from "./useFsWords.ts";

export function useRaidStepLabel() {
  const { t } = useTranslation();
  const fsWords = useFsWords();
  return (step: PlanStep, run: RaidRun): string => {
    const { choices } = run;
    switch (step.kind) {
      case "check":
        return choices.kind === "create"
          ? t("raidCreate.step.check")
          : t("raidAdd.step.check");
      case "erase":
        return t("addStorage.step.erase", { device: step.device ?? "" });
      case "create":
        return t("raidCreate.step.create");
      case "find":
        return t("raidCreate.step.find");
      case "fsCandidate":
        return t("raidCreate.step.fsCandidate");
      case "clear":
        return t("raidCreate.step.clear");
      case "fsCreate":
        return t("addStorage.step.create", {
          format: fsWords.typeWord(
            choices.kind === "create" ? choices.format : "ext4",
          ),
        });
      case "fsFind":
        return t("addStorage.step.find");
      case "fsSetUp":
        return t("addStorage.step.setUp");
      case "add":
        return choices.kind === "add" && choices.purpose === "bigger"
          ? t("raidAdd.step.grow")
          : t("raidAdd.step.add", {
              device: choices.targets.map(targetDevice).join(", "),
            });
      case "verifyAdd":
        return t("raidAdd.step.verify");
      case "takeOut":
        return t("raidAdd.step.takeOut");
      case "save":
        return choices.kind === "create"
          ? choices.forFiles
            ? t("raidCreate.step.saveAndMount")
            : t("raidCreate.step.save")
          : t("raidAdd.step.save");
      case "verify":
        return t("raidCreate.step.verify");
    }
  };
}
