// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikrosuite.com",
  base: "/scope/docs",
  integrations: [
    starlight({
      title: "MikroScope Docs",
      description:
        "Self-hosted log sidecar and static console for NDJSON ingestion, search, timelines, and alerts.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mikaelvesavuori/mikroscope",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "What is MikroScope?", link: "/getting-started/intro" },
            { label: "Installation", link: "/getting-started/installation" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Configuration", link: "/guides/configuration" },
            { label: "Console", link: "/guides/console" },
            { label: "Deployment", link: "/guides/deployment" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Comparison", link: "/reference/comparison" },
            { label: "API Reference", link: "/reference/api" },
            { label: "Architecture", link: "/reference/architecture" },
          ],
        },
      ],
    }),
  ],
});
