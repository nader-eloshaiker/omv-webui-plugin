// SPDX-License-Identifier: GPL-3.0-or-later
// What uses an array (phase 5 RAID design 0.11, 2.6): each file system OMV has set up on it, with a link
// to its page; a file system found on it but not set up; other storage this page cannot name; or
// nothing, with "Add storage on this array" handing the array to Flow A in memory (never in the
// address, D22), unless the array is short of a disk. After this session made the array bigger, the
// link to grow the file system on it.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { ExternalLink, UsedByPanel } from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { fsAddress } from "../../filesystems/fsModel.ts";
import { handOffDisk } from "../../filesystems/fsSession.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { raidSession } from "../../raid/raidSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";

export function ArrayUsedBy({
  view,
  onRetry,
}: {
  view: ArrayView;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const navigate = useNavigate();
  const memory = useMemoryStore(raidSession);
  const { row, state, used } = view;
  const grown = memory.grown.includes(row.uuid);

  if (used.kind !== "known") {
    return (
      <UsedByPanel
        title={t("array.usedBy.title")}
        headingLevel={2}
        referrers={[]}
        emptyText=""
        loading={
          used.kind === "loading"
            ? { label: t("array.usedBy.checking") }
            : undefined
        }
        error={
          used.kind === "unchecked"
            ? {
                message: t("array.usedBy.failed"),
                serverMessage: isRpcError(used.error)
                  ? { label: t("app.serverMessage"), text: used.error.message }
                  : undefined,
                retryLabel: t("common.tryAgain"),
                onRetry,
              }
            : undefined
        }
      />
    );
  }

  const referrers = [
    ...used.configured.map((fs) => {
      const address = fsAddress(fs);
      const name = words.nameText(fs);
      return {
        id: `fs:${fs.uuid}:${fs.devicefile}`,
        kind: t("array.usedBy.fs"),
        name,
        action:
          address === null ? undefined : (
            <Link
              to="/storage/filesystems/$fs"
              params={{ fs: address }}
              className={routerLinkClass}
            >
              {t("array.usedBy.openFs", { name })}
            </Link>
          ),
      };
    }),
    ...used.found.map((fs) => ({
      id: `found:${fs.uuid}:${fs.devicefile}`,
      kind: t("array.usedBy.fs"),
      name: t("array.usedBy.found", {
        name: words.nameText(fs),
        type: words.typeWord(fs.type),
      }),
      action: (
        <Link to="/storage/filesystems" className={routerLinkClass}>
          {t("array.usedBy.openList")}
        </Link>
      ),
    })),
  ];
  const refused = state.status === "critical" || state.status === "unknown";
  const nothing = referrers.length === 0 && !used.other && !used.creating;
  const growable = grown
    ? used.configured.find((fs) => fsAddress(fs) !== null)
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      <UsedByPanel
        title={t("array.usedBy.title")}
        headingLevel={2}
        referrers={referrers}
        emptyText={t("array.usedBy.none")}
        unknownUse={
          used.other || used.creating
            ? {
                message: used.creating
                  ? t("raidDelete.blocked.creating")
                  : t("array.usedBy.other"),
                classicLink: (
                  <ExternalLink
                    href={CLASSIC.raid}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("raid.classicLink")}
                  </ExternalLink>
                ),
              }
            : undefined
        }
      />
      {nothing ? (
        refused ? (
          <p className="text-sm">{t("array.usedBy.addRefused")}</p>
        ) : (
          <p>
            <button
              type="button"
              className={routerLinkClass}
              onClick={() => {
                handOffDisk(row.devicefile);
                void navigate({ to: "/storage/filesystems/add" });
              }}
            >
              {t("array.usedBy.addStorage")}
            </button>
          </p>
        )
      ) : null}
      {growable === undefined ? null : (
        <p className="text-sm">
          {t("array.usedBy.growFs")}{" "}
          <Link
            to="/storage/filesystems/$fs"
            params={{ fs: fsAddress(growable) ?? "" }}
            className={routerLinkClass}
          >
            {t("array.usedBy.growFsLink", { name: words.nameText(growable) })}
          </Link>
        </p>
      )}
    </div>
  );
}
