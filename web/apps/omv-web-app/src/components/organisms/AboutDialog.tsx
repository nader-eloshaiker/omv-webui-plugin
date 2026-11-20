// SPDX-License-Identifier: GPL-3.0-or-later
// What this interface is: an unofficial community plugin. The product name is plain text (no logo),
// and the only link is a fixed one to the upstream project (UI-3).
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ExternalLink,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";

const UPSTREAM = "https://www.openmediavault.org/";

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("about.title")}</DialogTitle>
          <DialogDescription>{t("about.body")}</DialogDescription>
        </DialogHeader>
        <p>
          <ExternalLink href={UPSTREAM} newTabLabel={t("app.newTab")}>
            {t("about.upstream")}
          </ExternalLink>
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="neutral" />}>
            {t("about.close")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
