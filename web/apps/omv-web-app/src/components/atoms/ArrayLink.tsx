// SPDX-License-Identifier: GPL-3.0-or-later
// An array, as a router link to its page (phase 5 RAID design 0.1, 0.6): "RAID /dev/md0", with the
// accessible name "Open RAID /dev/md0". The address is taken from the reply's device file only when it
// passes the address pattern; otherwise the name stays text, with no link.
import { Identifier } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { arrayAddress } from "../../raid/raidModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function ArrayLink({
  devicefile,
  linked = true,
  deviceOnly = false,
}: {
  devicefile: string;
  /** False when the RAID pages cannot be opened (the plugin is not installed). */
  linked?: boolean;
  /** Show the device only, where the sentence already says "RAID" ("Part of RAID /dev/md0"). */
  deviceOnly?: boolean;
}) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const address = arrayAddress({ devicefile });
  const shown = deviceOnly ? (
    <Identifier>{devicefile}</Identifier>
  ) : (
    words.arrayName(devicefile)
  );
  if (address === null || !linked) {
    return <>{shown}</>;
  }
  return (
    <Link
      to="/storage/md/$array"
      params={{ array: address }}
      aria-label={t("raid.open", { device: devicefile })}
      className={routerLinkClass}
    >
      {shown}
    </Link>
  );
}
