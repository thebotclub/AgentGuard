/**
 * AgentGuard Kill Switch
 *
 * Event-emitter-based kill switch per ARCHITECTURE.md §3.5.
 * Supports:
 *   - Global halt (tier: hard | soft — stops all agents)
 *   - Per-agent halt (tier: soft | hard)
 *   - Resume (clears halts)
 *
 * In-process state reflects what would be in Redis in production.
 * SDK background thread polls the Control Plane for kill switch updates.
 *
 * Tier semantics (from DATA_MODEL.md KillSwitchTier):
 *   SOFT: Finish current action, reject new ones
 *   HARD: Interrupt immediately
 */
import { EventEmitter } from 'node:events';
import { PolicyError } from './errors.js';
// ─── Kill Switch ──────────────────────────────────────────────────────────────
export class KillSwitch extends EventEmitter {
    state = {
        globalHalt: false,
        haltedAgents: new Set(),
    };
    haltTiers = new Map();
    globalTier = null;
    // ─── Global Halt ──────────────────────────────────────────────────────────
    /**
     * Halt ALL agents immediately.
     * Emits 'halt' event with scope='global'.
     */
    haltAll(reason, tier = 'hard', issuedBy) {
        const timestamp = new Date().toISOString();
        this.globalTier = tier;
        this.state = {
            ...this.state,
            globalHalt: true,
            globalHaltAt: timestamp,
            globalHaltReason: reason,
        };
        const event = { scope: 'global', tier, reason, issuedBy, timestamp };
        this.emit('halt', event);
    }
    /**
     * Resume all agents (clears global halt and all per-agent halts).
     * Emits 'resume' event with scope='global'.
     */
    resumeAll(resumedBy) {
        const timestamp = new Date().toISOString();
        this.globalTier = null;
        this.haltTiers.clear();
        this.state = {
            globalHalt: false,
            haltedAgents: new Set(),
        };
        this.emit('resume', { scope: 'global', resumedBy, timestamp });
    }
    // ─── Per-Agent Halt ───────────────────────────────────────────────────────
    /**
     * Halt a specific agent. Does NOT clear a global halt if one is active.
     * Emits 'halt' event with scope=agentId.
     */
    haltAgent(agentId, reason, tier = 'soft', issuedBy) {
        const timestamp = new Date().toISOString();
        this.state.haltedAgents.add(agentId);
        this.haltTiers.set(agentId, tier);
        const event = { scope: agentId, tier, reason, issuedBy, timestamp };
        this.emit('halt', event);
    }
    /**
     * Resume a specific agent.
     * Does not affect global halt state.
     * Emits 'resume' event with scope=agentId.
     */
    resumeAgent(agentId, resumedBy) {
        const timestamp = new Date().toISOString();
        this.state.haltedAgents.delete(agentId);
        this.haltTiers.delete(agentId);
        this.emit('resume', { scope: agentId, resumedBy, timestamp });
    }
    // ─── State Queries ────────────────────────────────────────────────────────
    /** Returns true if the given agent is halted (globally or individually). */
    isHalted(agentId) {
        return this.state.globalHalt || this.state.haltedAgents.has(agentId);
    }
    /** Returns true if the global halt is currently active. */
    isGlobalHalt() {
        return this.state.globalHalt;
    }
    /** Get the halt tier for an agent ('soft' | 'hard' | null if not halted). */
    getHaltTier(agentId) {
        if (this.state.globalHalt)
            return this.globalTier ?? 'hard';
        if (this.state.haltedAgents.has(agentId))
            return this.haltTiers.get(agentId) ?? 'soft';
        return null;
    }
    /** Read-only snapshot of current kill switch state. */
    getState() {
        return {
            ...this.state,
            haltedAgents: new Set(this.state.haltedAgents),
        };
    }
    // ─── Guard Method ─────────────────────────────────────────────────────────
    /**
     * Throws a PolicyError if the agent (or system) is halted.
     * Call this at the start of every action handler — O(1) check.
     *
     * @throws {PolicyError} with code 'GLOBAL_HALT' or 'AGENT_HALTED'
     */
    assertNotHalted(agentId) {
        if (this.state.globalHalt) {
            throw PolicyError.globalHalt(this.state.globalHaltReason, { agentId });
        }
        if (this.state.haltedAgents.has(agentId)) {
            throw PolicyError.agentHalted(agentId);
        }
    }
    // ─── Typed EventEmitter Overrides ─────────────────────────────────────────
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    emit(event, data) {
        return super.emit(event, data);
    }
}
//# sourceMappingURL=kill-switch.js.map