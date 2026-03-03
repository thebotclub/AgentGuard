/**
 * AgentGuard — Policy Engine Setup & Template Loading
 *
 * Exports:
 *  - DEFAULT_POLICY: the built-in demo/default PolicyDocument
 *  - templateCache: Map of loaded YAML policy templates
 *  - loadTemplates(): reads templates from disk into templateCache
 *  - TEMPLATES_DIR: resolved path to the templates directory
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { PolicyDocument } from '../../packages/sdk/src/core/types.js';
import type { PolicyTemplate } from '../types.js';

// ── Template Directory ─────────────────────────────────────────────────────

export const TEMPLATES_DIR = path.resolve(
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(process.argv[1] ?? '.'),
  '../templates'
);

export const templateCache = new Map<string, PolicyTemplate>();

export function loadTemplates(): void {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) return;
    const files = fs
      .readdirSync(TEMPLATES_DIR)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8');
        const parsed = yaml.load(raw) as PolicyTemplate;
        if (parsed?.id) templateCache.set(parsed.id, parsed);
      } catch (e) {
        console.error(
          `[templates] failed to load ${file}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    console.log(`[templates] loaded ${templateCache.size} policy templates`);
  } catch (e) {
    console.error(
      '[templates] failed to load templates dir:',
      e instanceof Error ? e.message : e,
    );
  }
}

// ── Default Demo Policy ────────────────────────────────────────────────────

export const DEFAULT_POLICY: PolicyDocument = {
  id: 'demo-policy',
  name: 'AgentGuard Demo Policy',
  description: 'Interactive demo policy for the AgentGuard playground',
  version: '1.0.0',
  default: 'allow',
  rules: [
    {
      id: 'block-external-http',
      description: 'Block all external HTTP requests to unapproved domains',
      priority: 10,
      action: 'block',
      severity: 'critical',
      when: [
        { tool: { in: ['http_request', 'http_post', 'fetch', 'curl', 'wget'] } },
        {
          params: {
            destination: {
              not_in: ['api.internal.com', 'db.internal.com', 'slack.internal.com'],
            },
          },
        },
      ],
      tags: ['data-protection', 'exfiltration'],
      riskBoost: 200,
    },
    {
      id: 'block-pii-tables',
      description: 'Block access to tables containing PII',
      priority: 20,
      action: 'block',
      severity: 'high',
      when: [
        { tool: { in: ['db_query', 'db_read', 'sql_execute'] } },
        {
          params: {
            table: { in: ['users', 'customers', 'employees', 'payroll'] },
          },
        },
      ],
      tags: ['privacy', 'compliance'],
      riskBoost: 150,
    },
    {
      id: 'block-privilege-escalation',
      description: 'Block system command and privilege escalation attempts',
      priority: 5,
      action: 'block',
      severity: 'critical',
      when: [
        {
          tool: {
            in: ['shell_exec', 'sudo', 'chmod', 'chown', 'system_command'],
          },
        },
      ],
      tags: ['security', 'privilege-escalation'],
      riskBoost: 300,
    },
    {
      id: 'monitor-llm-calls',
      description: 'Monitor all LLM API calls for cost and content tracking',
      priority: 50,
      action: 'monitor',
      severity: 'low',
      when: [
        {
          tool: {
            in: ['llm_query', 'openai_chat', 'anthropic_complete', 'gpt4'],
          },
        },
      ],
      tags: ['cost-tracking', 'observability'],
      riskBoost: 0,
    },
    {
      id: 'require-approval-financial',
      description: 'Require human approval for transactions over $1000',
      priority: 15,
      action: 'require_approval',
      severity: 'high',
      when: [
        {
          tool: {
            in: ['transfer_funds', 'create_payment', 'execute_transaction'],
          },
        },
        { params: { amount: { gt: 1000 } } },
      ],
      tags: ['financial', 'hitl'],
      riskBoost: 100,
      approvers: ['finance-team'],
      timeoutSec: 300,
      on_timeout: 'block',
    },
    {
      id: 'block-destructive-ops',
      description: 'Block all file/data deletion operations',
      priority: 8,
      action: 'block',
      severity: 'high',
      when: [
        {
          tool: {
            in: ['file_delete', 'rm', 'rmdir', 'unlink', 'drop_table'],
          },
        },
      ],
      tags: ['data-protection', 'destructive'],
      riskBoost: 200,
    },
    {
      id: 'allow-read-operations',
      description: 'Explicitly allow read-only operations',
      priority: 100,
      action: 'allow',
      severity: 'low',
      when: [
        {
          tool: {
            in: ['file_read', 'db_read_public', 'get_config', 'list_files'],
          },
        },
      ],
      tags: ['read-only'],
      riskBoost: 0,
    },
  ],
};
