// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes"],
  core: { disableTelemetry: true },
  framework: { name: "@storybook/react-vite", options: {} },
  // The framework wires React and Vite; Tailwind is added so the preview compiles the same
  // css-ui-style the app does (.storybook/preview.css).
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
