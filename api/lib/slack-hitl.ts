/**
 * AgentGuard — Slack HITL Notification
 *
 * Sends Block Kit approval request messages to a Slack webhook URL.
 * Uses native fetch() — no Slack SDK dependency.
 */
import type { ApprovalRow } from '../db-interface.js';

const DASHBOARD_URL = process.env['DASHBOARD_URL'] ?? 'https://app.agentguard.tech';

/** Truncate a string to max length with ellipsis */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

export interface SlackApprovalRequestOptions {
  /** Slack incoming webhook URL or response_url */
  webhookUrl: string;
  /** The approval record */
  approval: ApprovalRow;
  /** Agent name (for display) */
  agentName?: string;
  /** Risk reason / flag reason */
  riskReason?: string;
  /** Auto-reject timeout in minutes (default: 30) */
  autoRejectMinutes?: number;
}

export interface SlackSendResult {
  ok: boolean;
  /** HTTP status code from Slack */
  status?: number;
  /** Error message if not ok */
  error?: string;
}

/**
 * Post a Slack Block Kit approval request message.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 * Never throws — caller can fire-and-forget safely.
 */
export async function sendSlackApprovalRequest(
  options: SlackApprovalRequestOptions,
): Promise<SlackSendResult> {
  const { webhookUrl, approval, agentName, riskReason, autoRejectMinutes = 30 } = options;

  const expiresAt = new Date(
    new Date(approval.created_at).getTime() + autoRejectMinutes * 60 * 1000,
  );
  const expiryTs = Math.floor(expiresAt.getTime() / 1000);
  const expiryStr = expiresAt.toISOString();

  // Parse tool params for display
  let toolInputDisplay = '(no params)';
  if (approval.params_json) {
    try {
      const parsed = JSON.parse(approval.params_json) as unknown;
      toolInputDisplay = truncate(JSON.stringify(parsed, null, 2), 500);
    } catch {
      toolInputDisplay = truncate(approval.params_json, 500);
    }
  }

  const displayAgent = agentName ?? approval.agent_id ?? 'Unknown Agent';
  const displayReason = riskReason ?? 'Requires human approval';
  const dashboardLink = `${DASHBOARD_URL}/hitl/${approval.id}`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔐 AgentGuard — Action Requires Approval',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${displayAgent}` },
        { type: 'mrkdwn', text: `*Tool:*\n\`${approval.tool}\`` },
        { type: 'mrkdwn', text: `*Reason:*\n${displayReason}` },
        {
          type: 'mrkdwn',
          text: `*Auto-reject:*\n<!date^${expiryTs}^{date_short_pretty} at {time}|${expiryStr}>`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Tool Input:*\n\`\`\`${toolInputDisplay}\`\`\``,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `⏱️ Auto-reject in ${autoRejectMinutes} minutes if no response  |  <${dashboardLink}|View in dashboard>`,
        },
      ],
    },
    {
      type: 'actions',
      block_id: `hitl_actions_${approval.id}`,
      elements: [
        {
          type: 'button',
          action_id: 'hitl_approve',
          style: 'primary',
          text: { type: 'plain_text', text: '✅ Approve', emoji: true },
          value: approval.id,
          confirm: {
            title: { type: 'plain_text', text: 'Approve action?' },
            text: {
              type: 'mrkdwn',
              text: `Approve *${approval.tool}* for agent *${displayAgent}*?`,
            },
            confirm: { type: 'plain_text', text: 'Yes, approve' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
        {
          type: 'button',
          action_id: 'hitl_reject',
          style: 'danger',
          text: { type: 'plain_text', text: '❌ Reject', emoji: true },
          value: approval.id,
          confirm: {
            title: { type: 'plain_text', text: 'Reject action?' },
            text: {
              type: 'mrkdwn',
              text: `Reject *${approval.tool}* for agent *${displayAgent}*?`,
            },
            confirm: { type: 'plain_text', text: 'Yes, reject' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
      ],
    },
  ];

  const payload = { blocks };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[slack-hitl] Webhook POST failed: ${response.status} ${body}`);
      return { ok: false, status: response.status, error: `Slack returned ${response.status}: ${body}` };
    }

    return { ok: true, status: response.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[slack-hitl] fetch error: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Build a "resolved" Slack message (removes buttons, shows outcome).
 * Used to update the original message after approval/rejection.
 */
export function buildResolvedSlackMessage(
  approval: ApprovalRow,
  agentName?: string,
): object {
  const displayAgent = agentName ?? approval.agent_id ?? 'Unknown Agent';
  const isApproved = approval.status === 'approved';
  const icon = isApproved ? '✅' : '❌';
  const verb = isApproved ? 'Approved' : 'Rejected';
  const color = isApproved ? '#36a64f' : '#cc0000';

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${icon} *${verb}* — \`${approval.tool}\` for agent *${displayAgent}*`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: [
              `Status: *${verb}*`,
              approval.resolved_by ? `By: ${approval.resolved_by}` : null,
              approval.resolved_at
                ? `At: ${new Date(approval.resolved_at).toISOString()}`
                : null,
            ]
              .filter(Boolean)
              .join('  |  '),
          },
        ],
      },
    ],
    attachments: [
      {
        color,
        fallback: `${verb}: ${approval.tool}`,
      },
    ],
  };
}
