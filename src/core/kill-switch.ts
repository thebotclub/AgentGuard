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

import { PolicyError } from '@/core/errors.js';
import type { KillSwitchState } from '@/core/types.js';

// ─── Event Map ────────────────────────────────────────────────────────────────

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

// ─── Kill Switch ──────────────────────────────────────────────────────────────

export class KillSwitch extends EventEmitter {
  private state: KillSwitchState = {
    globalHalt: false,
    haltedAgents: new Set<string>(),
  };

  private haltTiers: Map<string, KillSwitchTier> = new Map();
  private globalTier: KillSwitchTier | null = null;

  // ─── Global Halt ──────────────────────────────────────────────────────────

  /**
   * Halt ALL agents immediately.
   * Emits 'halt' event with scope='global'.
   */
  haltAll(reason?: string, tier: KillSwitchTier = 'hard', issuedBy?: string): void {
    const timestamp = new Date().toISOString();
    this.globalTier = tier;
    this.state = {
      ...this.state,
      globalHalt: true,
      globalHaltAt: timestamp,
      globalHaltReason: reason,
    };
    const event: HaltEvent = { scope: 'global', tier, reason, issuedBy, timestamp };
    this.emit('halt', event);
  }

  /**
   * Resume all agents (clears global halt and all per-agent halts).
   * Emits 'resume' event with scope='global'.
   */
  resumeAll(resumedBy?: string): void {
    const timestamp = new Date().toISOString();
    this.globalTier = null;
    this.haltTiers.clear();
    this.state = {
      globalHalt: false,
      haltedAgents: new Set<string>(),
    };
    this.emit('resume', { scope: 'global', resumedBy, timestamp } satisfies ResumeEvent);
  }

  // ─── Per-Agent Halt ───────────────────────────────────────────────────────

  /**
   * Halt a specific agent. Does NOT clear a global halt if one is active.
   * Emits 'halt' event with scope=agentId.
   */
  haltAgent(agentId: string, reason?: string, tier: KillSwitchTier = 'soft', issuedBy?: string): void {
    const timestamp = new Date().toISOString();
    this.state.haltedAgents.add(agentId);
    this.haltTiers.set(agentId, tier);
    const event: HaltEvent = { scope: agentId, tier, reason, issuedBy, timestamp };
    this.emit('halt', event);
  }

  /**
   * Resume a specific agent.
   * Does not affect global halt state.
   * Emits 'resume' event with scope=agentId.
   */
  resumeAgent(agentId: string, resumedBy?: string): void {
    const timestamp = new Date().toISOString();
    this.state.haltedAgents.delete(agentId);
    this.haltTiers.delete(agentId);
    this.emit('resume', { scope: agentId, resumedBy, timestamp } satisfies ResumeEvent);
  }

  // ─── State Queries ────────────────────────────────────────────────────────

  /** Returns true if the given agent is halted (globally or individually). */
  isHalted(agentId: string): boolean {
    return this.state.globalHalt || this.state.haltedAgents.has(agentId);
  }

  /** Returns true if the global halt is currently active. */
  isGlobalHalt(): boolean {
    return this.state.globalHalt;
  }

  /** Get the halt tier for an agent ('soft' | 'hard' | null if not halted). */
  getHaltTier(agentId: string): KillSwitchTier | null {
    if (this.state.globalHalt) return this.globalTier ?? 'hard';
    if (this.state.haltedAgents.has(agentId)) return this.haltTiers.get(agentId) ?? 'soft';
    return null;
  }

  /** Read-only snapshot of current kill switch state. */
  getState(): Readonly<KillSwitchState> {
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
  assertNotHalted(agentId: string): void {
    if (this.state.globalHalt) {
      throw PolicyError.globalHalt(this.state.globalHaltReason, { agentId });
    }
    if (this.state.haltedAgents.has(agentId)) {
      throw PolicyError.agentHalted(agentId);
    }
  }

  // ─── Typed EventEmitter Overrides ─────────────────────────────────────────

  override on<K extends keyof KillSwitchEvents>(
    event: K,
    listener: (data: KillSwitchEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  override once<K extends keyof KillSwitchEvents>(
    event: K,
    listener: (data: KillSwitchEvents[K]) => void,
  ): this {
    return super.once(event, listener);
  }

  override off<K extends keyof KillSwitchEvents>(
    event: K,
    listener: (data: KillSwitchEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof KillSwitchEvents>(
    event: K,
    data: KillSwitchEvents[K],
  ): boolean {
    return super.emit(event, data);
  }
}
