/**
 * AgentGuard Kill Switch
 *
 * Event-emitter-based kill switch supporting:
 *   - Global halt (stops all agents immediately)
 *   - Per-agent halt (stops a specific agent)
 *   - Resume (clears halts)
 *
 * SDKs and wrappers listen for 'halt' and 'resume' events to interrupt
 * in-flight operations without polling.
 *
 * Usage:
 *   const ks = new KillSwitch();
 *   ks.on('halt', ({ agentId, reason }) => { ... });
 *   ks.haltAgent('agent-42', 'suspicious spend pattern');
 *   ks.assertNotHalted('agent-42');  // throws PolicyError if halted
 */
import { EventEmitter } from 'node:events';

import { PolicyError } from '@/core/errors.js';
import type { KillSwitchState } from '@/core/types.js';

// ─── Event map ────────────────────────────────────────────────────────────────

export interface KillSwitchEvents {
  /** Fired when any halt is activated */
  halt: HaltEvent;
  /** Fired when a halt is cleared */
  resume: ResumeEvent;
}

export interface HaltEvent {
  /** 'global' for system-wide halt, or the agentId for per-agent halt */
  scope: 'global' | string;
  reason?: string;
  timestamp: string;
}

export interface ResumeEvent {
  scope: 'global' | string;
  timestamp: string;
}

// ─── Kill Switch ──────────────────────────────────────────────────────────────

export class KillSwitch extends EventEmitter {
  private state: KillSwitchState = {
    globalHalt: false,
    haltedAgents: new Set(),
  };

  // ─── Global halt ────────────────────────────────────────────────────────────

  /** Halt ALL agents immediately. */
  haltAll(reason?: string): void {
    const timestamp = new Date().toISOString();
    this.state = {
      ...this.state,
      globalHalt: true,
      globalHaltAt: timestamp,
      globalHaltReason: reason,
    };
    const event: HaltEvent = { scope: 'global', reason, timestamp };
    this.emit('halt', event);
  }

  /** Resume all agents (clears global halt and all per-agent halts). */
  resumeAll(): void {
    const timestamp = new Date().toISOString();
    this.state = {
      globalHalt: false,
      haltedAgents: new Set(),
    };
    this.emit('resume', { scope: 'global', timestamp } satisfies ResumeEvent);
  }

  // ─── Per-agent halt ─────────────────────────────────────────────────────────

  /** Halt a specific agent. Does NOT clear a global halt if one is active. */
  haltAgent(agentId: string, reason?: string): void {
    const timestamp = new Date().toISOString();
    this.state.haltedAgents.add(agentId);
    const event: HaltEvent = { scope: agentId, reason, timestamp };
    this.emit('halt', event);
  }

  /** Resume a specific agent (does not affect global halt state). */
  resumeAgent(agentId: string): void {
    const timestamp = new Date().toISOString();
    this.state.haltedAgents.delete(agentId);
    this.emit('resume', { scope: agentId, timestamp } satisfies ResumeEvent);
  }

  // ─── State queries ──────────────────────────────────────────────────────────

  /** Returns true if the given agent is halted (globally or individually). */
  isHalted(agentId: string): boolean {
    return this.state.globalHalt || this.state.haltedAgents.has(agentId);
  }

  /** Returns true if the global halt is currently active. */
  isGlobalHalt(): boolean {
    return this.state.globalHalt;
  }

  /** Read-only snapshot of current kill switch state. */
  getState(): Readonly<KillSwitchState> {
    return { ...this.state, haltedAgents: new Set(this.state.haltedAgents) };
  }

  // ─── Guard method ───────────────────────────────────────────────────────────

  /**
   * Throws a PolicyError if the agent (or system) is halted.
   * Call this at the start of every action handler.
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

  // ─── EventEmitter typed overrides ──────────────────────────────────────────

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
