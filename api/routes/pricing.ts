/**
 * AgentGuard — Pricing Page Data Endpoint
 *
 * GET /api/v1/pricing  — public, no auth required
 *
 * Returns tier information including limits, features, and prices.
 * Used by the dashboard, landing page, and 402 upgrade prompts.
 */
import { Router, Request, Response } from 'express';
import { TIER_FEATURES, TIER_LIMITS } from '../lib/license-types.js';

// ── Pricing data ──────────────────────────────────────────────────────────

const FREE_FEATURES = [
  'core_evaluate',
  'audit_trail',
  'hitl',
  'pii_detection',
  'owasp_compliance',
  'policy_management',
  'kill_switch',
  'agent_management',
  'mcp_evaluate',
  'analytics_basic',
  'local_eval_sdk',
  'dashboard',
  'rest_api',
  'websocket_events',
];

const PRO_FEATURES = [
  ...FREE_FEATURES,
  'siem_export',
  'ml_anomaly',
  'a2a_governance',
  'custom_retention',
  'priority_support',
  'audit_export',
  'advanced_rbac',
  'policy_inheritance',
  'alert_webhooks',
  'hitl_unlimited',
];

const ENTERPRISE_FEATURES = [
  ...PRO_FEATURES,
  'sso',
  'air_gap',
  'custom_data_residency',
  'multi_region',
  'immutable_retention_7y',
  'dedicated_csm',
  'sla_99_9',
  'max_installs_custom',
];

const PRICING_DATA = {
  tiers: [
    {
      name: 'Free',
      price: 0,
      interval: null,
      limits: {
        eventsPerMonth: TIER_LIMITS.free.eventsPerMonth,    // 100_000
        agentsMax: TIER_LIMITS.free.agentsMax,              // 5
        retentionDays: TIER_LIMITS.free.retentionDays,      // 30
        hitlConcurrent: TIER_LIMITS.free.hitlConcurrent,   // 3
      },
      features: FREE_FEATURES,
      tierFeatureFlags: TIER_FEATURES.free,
    },
    {
      name: 'Pro',
      price: 14900, // $149.00 in cents
      interval: 'month',
      annualPrice: 11900, // $119.00/mo billed annually (20% discount)
      limits: {
        eventsPerMonth: TIER_LIMITS.pro.eventsPerMonth,    // 500_000
        agentsMax: TIER_LIMITS.pro.agentsMax,              // 100
        retentionDays: TIER_LIMITS.pro.retentionDays,      // 365
        hitlConcurrent: TIER_LIMITS.pro.hitlConcurrent,   // -1 (unlimited)
      },
      features: PRO_FEATURES,
      tierFeatureFlags: TIER_FEATURES.pro,
      trial: {
        days: 14,
        creditCardRequired: false,
      },
    },
    {
      name: 'Enterprise',
      price: null, // Custom pricing
      interval: 'year',
      limits: {
        eventsPerMonth: TIER_LIMITS.enterprise.eventsPerMonth, // -1 (unlimited)
        agentsMax: TIER_LIMITS.enterprise.agentsMax,           // -1 (unlimited)
        retentionDays: TIER_LIMITS.enterprise.retentionDays,   // 2555 (~7 years)
        hitlConcurrent: TIER_LIMITS.enterprise.hitlConcurrent, // -1 (unlimited)
      },
      features: ENTERPRISE_FEATURES,
      tierFeatureFlags: TIER_FEATURES.enterprise,
      contact: 'sales@agentguard.tech',
    },
  ],
  upgradeUrl: 'https://agentguard.tech/pricing',
  contactUrl: 'https://agentguard.tech/contact',
  docsUrl: 'https://docs.agentguard.tech/licensing',
};

// ── Route factory ─────────────────────────────────────────────────────────

export function createPricingRoutes(): Router {
  const router = Router();

  /**
   * GET /api/v1/pricing
   * Public — no auth required.
   * Returns pricing tiers with limits and feature lists.
   */
  router.get('/api/v1/pricing', (_req: Request, res: Response) => {
    // Cache for 5 minutes (pricing rarely changes)
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(PRICING_DATA);
  });

  return router;
}
