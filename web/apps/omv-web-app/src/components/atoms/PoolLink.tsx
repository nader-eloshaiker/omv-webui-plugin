// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS pool's name as a router link to its page (phase 5 ZFS design 0.7), in the mono face; as text
// when the name is outside the address pattern (no page) or the plugin is not known to be installed.
import { Identifier } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";

export function PoolLink({
  pool,
  linked = true,
}: {
  pool: string;
  linked?: boolean;
}) {
  const { t } = useTranslation();
  if (!linked || !isPoolAddress(pool)) {
    return <Identifier dir="auto">{pool}</Identifier>;
  }
  return (
    <Link
      to="/storage/zfs/pools/$pool"
      params={{ pool }}
      aria-label={t("zfs.open", { pool })}
      className={routerLinkClass}
    >
      <Identifier dir="auto">{pool}</Identifier>
    </Link>
  );
}
