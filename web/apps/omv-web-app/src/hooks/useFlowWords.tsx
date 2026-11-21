// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A's words (phase 5 file-systems design 6.4, 6.5, 6.6, 7.2): each device named exactly, as the
// wipe confirmation names it (device, model, serial number, size with the size on its label), what is
// on a disk that will be erased, the summary's items in the order the steps run, and the step labels.
// Server values sit in our sentences as text, each isolated (Slotted, UI-2).
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { Identifier } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Slotted } from "../components/atoms/Slotted.tsx";
import type { FsRef } from "../disks/diskUse.ts";
import { labelSize } from "../disks/diskWords.ts";
import {
  targetDevice,
  type FlowChoices,
  type PlanStep,
  type Target,
} from "../filesystems/flowRun.ts";
import { fsName, splitTags } from "../filesystems/fsModel.ts";
import { btrfsUsable, diskBytes } from "../filesystems/storageChoices.ts";
import { formatBytes, parseByteCount } from "../format/format.ts";
import { useFsWords } from "./useFsWords.ts";

export function useFlowWords() {
  const { t } = useTranslation();
  const words = useFsWords();

  const sizes = (size: string) => {
    const bytes = parseByteCount(size);
    const label = labelSize(bytes);
    return {
      size: bytes === null ? "" : formatBytes(bytes),
      label: label === null ? "" : t("format.sizeDecimal", label),
    };
  };

  /** "Holds the file system old-pc (NTFS, 931.5 GiB), not used on this NAS." */
  const holdsText = (holds: readonly FsRef[]): string[] =>
    holds.length === 0
      ? [t("addStorage.holds.unknown")]
      : holds.map((fs) => {
          const name = words.nameOf(
            fsName({
              label: fs.label,
              type: fs.type,
              canonicaldevicefile: fs.device,
              devicefile: fs.device,
            }),
          );
          return fs.size === null
            ? t("addStorage.holds.fsUnusedNoSize", {
                name,
                type: words.typeWord(fs.type),
              })
            : t("addStorage.holds.fsUnused", {
                name,
                type: words.typeWord(fs.type),
                size: formatBytes(fs.size),
              });
        });

  /** The radio or checkbox option of a disk: "/dev/sdb, Example HDD 4TB, 3.6 TiB". */
  const diskOption = (disk: DiskDevice): ReactNode => {
    const model = disk.model.trim();
    const { size } = sizes(disk.size);
    return model === "" ? (
      <Slotted
        sentence={(tokens) =>
          t("addStorage.optionNoModel", { ...tokens, size })
        }
        values={{ device: <Identifier>{disk.canonicaldevicefile}</Identifier> }}
      />
    ) : (
      <Slotted
        sentence={(tokens) => t("addStorage.option", { ...tokens, size })}
        values={{
          device: <Identifier>{disk.canonicaldevicefile}</Identifier>,
          model,
        }}
      />
    );
  };

  /** One disk's summary line: erased with what is lost, or used whole (6.5). */
  const diskLine = (target: Extract<Target, { kind: "disk" }>): ReactNode => {
    const { disk } = target;
    const { size, label } = sizes(disk.size);
    const common = {
      device: <Identifier>{disk.canonicaldevicefile}</Identifier>,
      model: disk.model.trim(),
      serial: <Identifier>{disk.serialnumber}</Identifier>,
    };
    return target.group === "reuse" ? (
      <Slotted
        sentence={(tokens) =>
          t("addStorage.sum.erase", { ...tokens, size, label })
        }
        values={{ ...common, what: holdsText(target.holds).join(" ") }}
      />
    ) : (
      <Slotted
        sentence={(tokens) =>
          t("addStorage.sum.useWhole", { ...tokens, size, label })
        }
        values={common}
      />
    );
  };

  const formatWord = (choices: FlowChoices) => words.typeWord(choices.format);

  const wayWord = (choices: FlowChoices) =>
    t(`addStorage.multi.${choices.profile ?? "raid1"}`);

  /** 6.5, 7.2: one item per action, in the order they run. */
  const summaryItems = (choices: FlowChoices): ReactNode[] => {
    const items: ReactNode[] = [];
    const target = choices.targets[0];
    if (choices.kind === "multi") {
      items.push(
        <>
          {t("addStorage.multi.sum.erase", { count: choices.targets.length })}
          <ul className="mt-1 flex list-[circle] flex-col gap-1 ps-5">
            {choices.targets.map((each) =>
              each.kind === "disk" ? (
                <li key={each.disk.devicefile}>{diskLine(each)}</li>
              ) : null,
            )}
          </ul>
        </>,
      );
      const usable = btrfsUsable(
        choices.targets.map((each) =>
          each.kind === "disk" ? diskBytes(each.disk) : 0,
        ),
        choices.profile ?? "raid1",
      );
      items.push(
        t("addStorage.multi.sum.combine", {
          way: wayWord(choices),
          usable: formatBytes(usable),
        }),
      );
    } else if (target?.kind === "raid") {
      const { size } = sizes(target.array.size);
      items.push(
        <Slotted
          sentence={(tokens) =>
            t("addStorage.sum.useWholeRaid", { ...tokens, size })
          }
          values={{
            device: <Identifier>{target.array.devicefile}</Identifier>,
          }}
        />,
      );
      items.push(
        <Slotted
          sentence={(tokens) =>
            t("addStorage.sum.createOnRaid", {
              ...tokens,
              format: formatWord(choices),
            })
          }
          values={{
            name: (
              <Identifier>
                {target.array.name.trim() || target.array.devicefile}
              </Identifier>
            ),
          }}
        />,
      );
    } else if (target !== undefined) {
      items.push(diskLine(target));
      items.push(t("addStorage.sum.create", { format: formatWord(choices) }));
    }
    const tags = splitTags(choices.tags);
    if (tags.length > 0) {
      items.push(
        <Slotted
          sentence={(tokens) => t("addStorage.sum.tags", tokens)}
          values={{ tags: tags.join(", ") }}
        />,
      );
    }
    items.push(
      choices.level > 0
        ? t("addStorage.sum.level", { level: `${String(choices.level)}%` })
        : t("addStorage.sum.noLevel"),
    );
    items.push(t("addStorage.sum.mount"));
    items.push(t("addStorage.sum.shareNext"));
    return items;
  };

  /** A step's label, as the step list says it (6.6, 7.3). */
  const stepLabel = (step: PlanStep, choices: FlowChoices): string => {
    const first = choices.targets[0];
    switch (step.kind) {
      case "check":
        return choices.kind === "multi"
          ? t("addStorage.multi.step.check")
          : t("addStorage.step.check", {
              device: first === undefined ? "" : targetDevice(first),
            });
      case "erase":
        return t("addStorage.step.erase", { device: step.device ?? "" });
      case "create":
        return choices.kind === "multi"
          ? t("addStorage.multi.step.create")
          : t("addStorage.step.create", { format: formatWord(choices) });
      case "find":
        return t("addStorage.step.find");
      case "setUp":
        return t("addStorage.step.setUp");
      case "mount":
        return t("addStorage.step.mount");
      case "verify":
        return t("addStorage.step.verify");
    }
  };

  return { diskOption, diskLine, holdsText, summaryItems, stepLabel, sizes };
}
