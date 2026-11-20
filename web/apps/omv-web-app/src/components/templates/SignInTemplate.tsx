// SPDX-License-Identifier: GPL-3.0-or-later
// The frame of the sign-in screens: the product name, one card, the appearance choice. Slots only.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ThemeSelect } from "../molecules/ThemeSelect.tsx";

export function SignInTemplate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <main className="flex flex-1 justify-center px-4 py-12 sm:items-center sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <p className="text-lg font-semibold text-foreground">
            {t("app.name")}
          </p>
          <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6 shadow-sm">
            {children}
          </div>
        </div>
      </main>
      <footer className="flex justify-center px-4 pb-6">
        <ThemeSelect />
      </footer>
    </div>
  );
}
