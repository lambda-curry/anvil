// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://lambda-curry.github.io',
  base: '/anvil',
  trailingSlash: 'never',
  integrations: [
    starlight({
      title: 'Anvil',
      description: 'AI rules audit engine — score, detect drift, and improve rules in any AI-assisted codebase',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub (private)',
          href: 'https://github.com/lambda-curry/anvil',
        },
        {
          icon: 'npm',
          label: 'npm',
          href: 'https://www.npmjs.com/package/@lambdacurry/anvil',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'First Audit', slug: 'getting-started/first-audit' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Configuration', slug: 'guides/configuration' },
            { label: 'BYOK & Trust Model', slug: 'guides/byok-trust-model' },
            { label: 'Drift Detection', slug: 'guides/drift-detection' },
            { label: 'Bootstrap Rules', slug: 'guides/bootstrap' },
            { label: 'Mine PR History', slug: 'guides/mine-pr' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI Reference', slug: 'reference/cli' },
            { label: 'Scoring Rubric', slug: 'reference/rubric' },
            { label: 'Agent Skill', slug: 'reference/agent-skill' },
          ],
        },
      ],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#1e1e2e" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: "/anvil/og-image.png" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "/anvil/og-image.png" },
        },
        {
          tag: "link",
          attrs: {
            rel: "alternative",
            type: "text/markdown",
            title: "llms.txt",
            href: "/anvil/llms.txt",
          },
        },
      ],
    }),
  ],
});
