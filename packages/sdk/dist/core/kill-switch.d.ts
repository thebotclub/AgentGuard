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
import type { KillSwitchState } from './types.js';
export type KillSwitchTier = 'soft' | 'hard';
export interface HaltEvent {
    /** 'global' for system-wide halt, or the agentId for per-agent halt */
    scope: 'global' | string;
    /** Kill switch tier */
    tier: KillSwitchTier;
    reason?: string;
    issuedBy?: string;
    timestamp: string;
}
export interface ResumeEvent {
    scope: 'global' | string;
    resumedBy?: string;
    timestamp: string;
}
export interface KillSwitchEvents {
    /** Fired when any halt is activated */
    halt: HaltEvent;
    /** Fired when a halt is cleared */
    resume: ResumeEvent;
}
export declare class KillSwitch extends EventEmitter {
    private state;
    private haltTiers;
    private globalTier;
    /**
     * Halt ALL agents immediately.
     * Emits 'halt' event with scope='global'.
     */
    haltAll(reason?: string, tier?: KillSwitchTier, issuedBy?: string): void;
    /**
     * Resume all agents (clears global halt and all per-agent halts).
     * Emits 'resume' event with scope='global'.
     */
    resumeAll(resumedBy?: string): void;
    /**
     * Halt a specific agent. Does NOT clear a global halt if one is active.
     * Emits 'halt' event with scope=agentId.
     */
    haltAgent(agentId: string, reason?: string, tier?: KillSwitchTier, issuedBy?: string): void;
    /**
     * Resume a specific agent.
     * Does not affect global halt state.
     * Emits 'resume' event with scope=agentId.
     */
    resumeAgent(agentId: string, resumedBy?: string): void;
    /** Returns true if the given agent is halted (globally or individually). */
    isHalted(agentId: string): boolean;
    /** Returns true if the global halt is currently active. */
    isGlobalHalt(): boolean;
    /** Get the halt tier for an agent ('soft' | 'hard' | null if not halted). */
    getHaltTier(agentId: string): KillSwitchTier | null;
    /** Read-only snapshot of current kill switch state. */
    getState(): Readonly<KillSwitchState>;
    /**
     * Throws a PolicyError if the agent (or system) is halted.
     * Call this at the start of every action handler — O(1) check.
     *
     * @throws {PolicyError} with code 'GLOBAL_HALT' or 'AGENT_HALTED'
     */
    assertNotHalted(agentId: string): void;
    on<K extends keyof KillSwitchEvents>(event: K, listener: (data: KillSwitchEvents[K]) => void): this;
    once<K extends keyof KillSwitchEvents>(event: K, listener: (data: KillSwitchEvents[K]) => void): this;
    off<K extends keyof KillSwitchEvents>(event: K, listener: (data: KillSwitchEvents[K]) => void): this;
    emit<K extends keyof KillSwitchEvents>(event: K, data: KillSwitchEvents[K]): boolean;
}
//# sourceMappingURL=kill-switch.d.ts.map