/**
 * AgentGuard SDK — Public API
 *
 * Named exports only. No default exports.
 */
export {
  AgentGuardToolWrapper,
  GuardedTool,
  ApprovalEventBus,
} from './langchain-wrapper.js';

export type {
  LangChainTool,
  WrapperOptions,
  ApprovalEvents,
} from './langchain-wrapper.js';

export { AgentGuard } from './client.js';
export { LocalPolicyEngine } from './local-policy-engine.js';
export type { EvaluateResult } from './local-policy-engine.js';

// Auto-register exports
export {
  autoRegister,
  getOrCreateGuard,
  listAgents,
  clearCredentials,
  getAgentCredentials,
  getDefaultStoragePath,
  withRetry,
  isRateLimitError,
  formatRateLimitError,
} from '../auto-register.js';

export type {
  AutoRegisterOptions,
  AgentCredentials,
  StoredConfig,
  RateLimitError,
  RegistrationError,
} from '../auto-register.js';
