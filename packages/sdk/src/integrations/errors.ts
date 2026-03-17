/**
 * AgentGuard — Integration Error Classes
 *
 * Provides a typed error class for blocked tool calls, suitable for
 * catch blocks in LangChain, OpenAI, CrewAI, and Express integrations.
 */

// ─── AgentGuardBlockError ─────────────────────────────────────────────────────

/**
 * Thrown when AgentGuard blocks a tool call.
 *
 * Contains the full decision context so callers can log, display, or act on
 * the reason for the block without parsing strings.
 *
 * @example
 * try {
 *   await langchainGuard({ apiKey }).handleToolStart({ name: 'exec' }, '{}');
 * } catch (err) {
 *   if (err instanceof AgentGuardBlockError) {
 *     console.log('Blocked:', err.reason);
 *     console.log('Try instead:', err.alternatives);
 *   }
 * }
 */
export class AgentGuardBlockError extends Error {
  /** Always "block" or "require_approval" */
  decision: string;

  /** Risk score 0–1000 */
  riskScore: number;

  /** Human-readable explanation of why the action was blocked */
  reason: string;

  /** What the agent should do instead */
  suggestion: string;

  /** Link to relevant documentation */
  docs: string;

  /** Allowed tools with similar capability */
  alternatives: string[];

  /** The tool that was blocked */
  tool?: string;

  /** The matched policy rule ID, if any */
  matchedRuleId?: string;

  /** Approval URL (present when decision is "require_approval") */
  approvalUrl?: string;

  /** Approval ID (present when decision is "require_approval") */
  approvalId?: string;

  constructor(result: Record<string, unknown>) {
    const tool = (result['tool'] as string | undefined) ?? 'unknown';
    const reason = (result['reason'] as string | undefined) ?? 'Blocked by AgentGuard policy';
    super(`AgentGuard blocked tool "${tool}": ${reason}`);
    this.name = 'AgentGuardBlockError';

    this.decision = (result['decision'] as string | undefined) ?? 'block';
    this.riskScore = (result['riskScore'] as number | undefined) ?? 0;
    this.reason = reason;
    this.suggestion = (result['suggestion'] as string | undefined) ?? '';
    this.docs = (result['docs'] as string | undefined) ?? 'https://agentguard.tech/docs/policy';
    this.alternatives = (result['alternatives'] as string[] | undefined) ?? [];
    this.tool = tool;
    this.matchedRuleId = result['matchedRuleId'] as string | undefined;
    this.approvalUrl = result['approvalUrl'] as string | undefined;
    this.approvalId = result['approvalId'] as string | undefined;

    // Ensure instanceof works correctly in transpiled environments
    Object.setPrototypeOf(this, AgentGuardBlockError.prototype);
  }
}
