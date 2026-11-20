// SPDX-License-Identifier: GPL-3.0-or-later
// A second-factor method this interface has no form for: say so and point to the classic interface
// at the fixed address "/", in a new tab like every link out of the interface. The server's own
// redirect address is never followed (UI-3); the
// transport does not even pass it on.
import { Button, ExternalLink } from "@omv-webui/react-ui-components";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export function UnsupportedChallenge({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The password form this replaces held the focus; move it to what the page now says.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section
      aria-labelledby="unsupported-title"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h1
          ref={headingRef}
          id="unsupported-title"
          tabIndex={-1}
          className="text-xl font-semibold outline-hidden"
        >
          {t("unsupported.title")}
        </h1>
        <p className="text-muted-foreground">{t("unsupported.body")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <ExternalLink
          href="/"
          newTabLabel={t("app.newTab")}
          className="self-center py-2"
        >
          {t("unsupported.link")}
        </ExternalLink>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={onCancel}
        >
          {t("unsupported.cancel")}
        </Button>
      </div>
    </section>
  );
}
