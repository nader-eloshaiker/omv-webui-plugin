// SPDX-License-Identifier: GPL-3.0-or-later
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Decorator, Preview } from "@storybook/react-vite";
import { Toaster } from "../src/components/toast/toast";
import { UiProvider } from "../src/components/ui-provider/ui-provider";
import { DocumentDensity, type Density } from "./document-density";
import "./preview.css";

const PANELS: readonly { theme: "dark" | "light"; density: Density }[] = [
  { theme: "dark", density: "comfortable" },
  { theme: "light", density: "comfortable" },
  { theme: "dark", density: "compact" },
  { theme: "light", density: "compact" },
];

const withDensity: Decorator = (Story, context) => (
  <DocumentDensity
    density={(context.globals.density ?? "comfortable") as Density}
  >
    <Story />
  </DocumentDensity>
);

// The review surface (design-system skill, section 6): every story in both themes and both densities
// at once, each panel on the page ground with the ambient light, as a page shows it. Theme and density
// are a class and an attribute on the panel, so the tokens resolve per panel. A story that opens an
// overlay on mount (a dialog, an open menu) sets `matrix: false`, and a story with
// `layout: "fullscreen"` fills the window; both follow the toolbar instead. Popups in a portal always
// follow the toolbar's theme and density.
const withMatrix: Decorator = (Story, context) => {
  const wanted = (context.globals.matrix ?? "all") === "all";
  const allowed =
    context.parameters.matrix !== false &&
    context.parameters.layout !== "fullscreen";
  if (!wanted || !allowed) {
    return <Story />;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {PANELS.map(({ theme, density }) => (
        <section
          key={`${theme}-${density}`}
          aria-label={`${theme === "dark" ? "Dark" : "Light"}, ${density}`}
          data-density={density}
          className={`${theme} min-w-0 rounded-card bg-page p-6 text-body text-foreground ambient-light`}
        >
          <p className="mb-4 text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">
            {theme === "dark" ? "Dark" : "Light"} ·{" "}
            {density === "compact" ? "Compact" : "Comfortable"}
          </p>
          <Story />
        </section>
      ))}
    </div>
  );
};

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i } },
    options: {
      storySort: { order: ["Foundations", "Components", "Patterns"] },
    },
  },
  globalTypes: {
    density: {
      description:
        "Density: Sky (comfortable) or Instrument's values (compact)",
      toolbar: {
        title: "Density",
        icon: "component",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
        dynamicTitle: true,
      },
    },
    matrix: {
      description: "Show each story in both themes and both densities",
      toolbar: {
        title: "Layout",
        icon: "grid",
        items: [
          { value: "all", title: "Both themes, both densities" },
          { value: "single", title: "The toolbar's theme and density" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { density: "comfortable", matrix: "all" },
  decorators: [
    withMatrix,
    withDensity,
    // As the app mounts them: Base UI inside CSPProvider disableStyleElements (D7), and one toast
    // viewport. Stories may pass English; components never carry their own words.
    (Story) => (
      <UiProvider>
        <Story />
        <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
      </UiProvider>
    ),
    // Dark first, light from the toolbar. Both are explicit classes on <html>, so the OS preference
    // of the machine running Storybook never decides which theme a reviewer sees.
    withThemeByClassName({
      themes: { Dark: "dark", Light: "light" },
      defaultTheme: "Dark",
      parentSelector: "html",
    }),
  ],
};

export default preview;
