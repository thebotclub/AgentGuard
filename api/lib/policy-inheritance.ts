/**
 * AgentGuard — Policy Inheritance (Monotonic Restriction)
 *
 * Child agents can ONLY add restrictions; they can never relax their parent's policy.
 * This is enforced at spawn time by computing the merged (child) policy here.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentPolicy {
  /** Explicitly allowed tools. Empty/undefined = no allowList filter (parent determines). */
  allowedTools?: string[];
  /** Explicitly blocked tools. */
  blockedTools?: string[];
  /** Tools that require human-in-the-loop approval. */
  hitlTools?: string[];
}

/**
 * Compute the effective policy for a child agent given its parent's policy and
 * the child's requested restrictions.
 *
 * Monotonic restriction rules:
 *  - blockedTools: union of parent + child (child can only add, never remove)
 *  - allowedTools: intersection (child can only restrict, never expand)
 *    - if parent has no allowList → child allowList applies as-is
 *    - if child has no allowList → parent allowList applies as-is
 *    - if both have allowList → intersection
 *  - hitlTools: union (child can only add HITL requirements, never remove)
 */
export function computeChildPolicy(
  parentPolicy: AgentPolicy,
  childRestrictions: AgentPolicy,
): AgentPolicy {
  // ── blockedTools: union ────────────────────────────────────────────────────
  const parentBlocked = new Set<string>(parentPolicy.blockedTools ?? []);
  const childBlocked = new Set<string>(childRestrictions.blockedTools ?? []);
  const mergedBlocked = new Set<string>([...parentBlocked, ...childBlocked]);

  // ── allowedTools: intersection ─────────────────────────────────────────────
  const parentAllowed = parentPolicy.allowedTools;
  const childAllowed = childRestrictions.allowedTools;

  let mergedAllowed: string[] | undefined;

  if (parentAllowed !== undefined && childAllowed !== undefined) {
    // Both have an allowList → intersection
    const parentAllowedSet = new Set<string>(parentAllowed);
    mergedAllowed = childAllowed.filter((t) => parentAllowedSet.has(t));
  } else if (parentAllowed !== undefined) {
    // Only parent has allowList → child must respect parent's allowList
    mergedAllowed = [...parentAllowed];
  } else if (childAllowed !== undefined) {
    // Only child has allowList → child's list applies directly
    mergedAllowed = [...childAllowed];
  } else {
    // Neither has allowList → no allowList filter
    mergedAllowed = undefined;
  }

  // Remove any tools from allowedList that are blocked (blocked wins)
  if (mergedAllowed !== undefined && mergedBlocked.size > 0) {
    mergedAllowed = mergedAllowed.filter((t) => !mergedBlocked.has(t));
  }

  // ── hitlTools: union ───────────────────────────────────────────────────────
  const parentHitl = new Set<string>(parentPolicy.hitlTools ?? []);
  const childHitl = new Set<string>(childRestrictions.hitlTools ?? []);
  const mergedHitl = new Set<string>([...parentHitl, ...childHitl]);

  const result: AgentPolicy = {};

  if (mergedAllowed !== undefined) {
    result.allowedTools = mergedAllowed;
  }
  if (mergedBlocked.size > 0) {
    result.blockedTools = [...mergedBlocked];
  }
  if (mergedHitl.size > 0) {
    result.hitlTools = [...mergedHitl];
  }

  return result;
}

/**
 * Check if a tool call is permitted by the given agent policy.
 * Returns a decision object with allowed/blocked status and reason.
 */
export function evaluateToolAgainstPolicy(
  tool: string,
  policy: AgentPolicy,
): { allowed: boolean; reason?: string } {
  // blockedTools takes priority
  if (policy.blockedTools?.includes(tool)) {
    return { allowed: false, reason: `Tool '${tool}' is blocked by agent policy` };
  }

  // allowedTools: if set, tool must be in the list
  if (policy.allowedTools !== undefined && policy.allowedTools.length > 0) {
    if (!policy.allowedTools.includes(tool)) {
      return {
        allowed: false,
        reason: `Tool '${tool}' is not in agent's allowed tools list`,
      };
    }
  }

  return { allowed: true };
}
