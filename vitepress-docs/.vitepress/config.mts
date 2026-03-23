import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'AgentGuard',
  description: 'Runtime security for AI agents. Evaluate every tool call. Block threats in real-time.',
  base: '/docs/',
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', href: '/docs/favicon.ico' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'AgentGuard Docs' }],
    ['meta', { name: 'og:description', content: 'Runtime security for AI agents.' }],
  ],

  themeConfig: {
    logo: '/agentguard-logo.svg',
    siteTitle: 'AgentGuard',

    nav: [
      { text: 'Quickstart', link: '/getting-started/quickstart' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Integrations', link: '/integrations/langchain' },
      { text: 'API Reference', link: '/api/overview' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'Security', link: '/security/hardening' },
      {
        text: 'v0.9.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quickstart', link: '/getting-started/quickstart' },
            { text: 'Architecture', link: '/getting-started/architecture' },
            { text: 'Troubleshooting', link: '/getting-started/troubleshooting' },
          ],
        },
      ],
      '/integrations/': [
        {
          text: 'Framework Integrations',
          items: [
            { text: 'LangChain', link: '/integrations/langchain' },
            { text: 'CrewAI', link: '/integrations/crewai' },
            { text: 'AutoGen / AG2', link: '/integrations/autogen' },
          ],
        },
      ],
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: '5-Minute Quickstart', link: '/getting-started/quickstart' },
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/getting-started' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Policy Engine', link: '/guide/policy-engine' },
            { text: 'Kill Switch', link: '/guide/kill-switch' },
            { text: 'Audit Trail', link: '/guide/audit-trail' },
            { text: 'PII Detection', link: '/guide/pii-detection' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: 'TypeScript SDK', link: '/guide/sdk-typescript' },
            { text: 'Python SDK', link: '/guide/sdk-python' },
            { text: 'LangChain', link: '/integrations/langchain' },
            { text: 'CrewAI', link: '/integrations/crewai' },
            { text: 'AutoGen / AG2', link: '/integrations/autogen' },
            { text: 'MCP Servers', link: '/guide/mcp-servers' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/overview' },
            { text: 'Authentication', link: '/api/authentication' },
            { text: 'Evaluate', link: '/api/evaluate' },
            { text: 'Agents', link: '/api/agents' },
            { text: 'Audit', link: '/api/audit' },
            { text: 'Policy', link: '/api/policy' },
            { text: 'Approvals', link: '/api/approvals' },
            { text: 'Analytics', link: '/api/analytics' },
          ],
        },
        {
          text: 'OpenAPI',
          items: [
            { text: 'Swagger UI', link: '/api/swagger' },
            { text: 'Download Spec', link: '/api/spec-download' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'Policy Engine', link: '/architecture/policy-engine' },
            { text: 'Deployment', link: '/architecture/deployment' },
          ],
        },
      ],
      '/security/': [
        {
          text: 'Security',
          items: [
            { text: 'Hardening Guide', link: '/security/hardening' },
            { text: 'Compliance', link: '/security/compliance' },
            { text: 'Pen Test Results', link: '/security/pentest' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/thebotclub/AgentGuard' },
    ],

    footer: {
      message: 'Released under the BSL 1.1 License.',
      copyright: 'Copyright © 2025-present AgentGuard',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/thebotclub/AgentGuard/edit/main/vitepress-docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
