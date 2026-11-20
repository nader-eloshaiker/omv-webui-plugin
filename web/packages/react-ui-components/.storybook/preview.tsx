// SPDX-License-Identifier: GPL-3.0-or-later
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
import { Toaster } from "../src/components/toast/toast";
import { UiProvider } from "../src/components/ui-provider/ui-provider";
import "./preview.css";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i } },
    options: {
      storySort: { order: ["Foundations", "Components", "Patterns"] },
    },
  },
  decorators: [
    // As the app mounts them: Base UI inside CSPProvider disableStyleElements (D7), and one toast
    // viewport. Stories may pass English; components never carry their own words.
    (Story) => (
      <UiProvider>
        <Story />
        <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
      </UiProvider>
    ),
    // Light and dark from the toolbar. Both are explicit classes on <html>, so the OS preference of
    // the machine running Storybook never decides which theme a reviewer sees.
    withThemeByClassName({
      themes: { Light: "light", Dark: "dark" },
      defaultTheme: "Light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
