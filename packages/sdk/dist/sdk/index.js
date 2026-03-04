/**
 * AgentGuard SDK — Public API
 *
 * Named exports only. No default exports.
 */
export { AgentGuardToolWrapper, GuardedTool, ApprovalEventBus, } from './langchain-wrapper.js';
export { AgentGuard } from './client.js';
// Auto-register exports
export { autoRegister, getOrCreateGuard, listAgents, clearCredentials, getAgentCredentials, getDefaultStoragePath, withRetry, isRateLimitError, formatRateLimitError, } from '../auto-register.js';
//# sourceMappingURL=index.js.map