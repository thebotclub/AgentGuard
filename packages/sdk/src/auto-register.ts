/**
 * AgentGuard Auto-Register Module
 * 
 * Enables AI agents to self-provision security credentials without human intervention.
 * Supports automatic account creation, key persistence, and key rotation.
 * 
 * @module @the-bot-club/agentguard/auto-register
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://api.agentguard.dev';
const CONFIG_DIR = '.agentguard';
const CONFIG_FILE = 'config.json';
const _AGENT_KEY_FILE = 'agent.key'; // reserved for future explicit key-file path exposure

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AutoRegisterOptions {
  /** Enable auto-registration - creates account if needed */
  autoRegister?: boolean;
  /** Agent identifier (auto-generated if not provided) */
  agentId?: string;
  /** Agent name for display in dashboard */
  agentName?: string;
  /** Custom storage path (default: ~/.agentguard) */
  storagePath?: string;
  /** Custom base URL (default: https://api.agentguard.dev) */
  baseUrl?: string;
  /** Enable key rotation on startup */
  rotateKey?: boolean;
  /** Callback when a new key is created */
  onKeyCreated?: (key: string, agentId: string) => void | Promise<void>;
  /** Callback when key is rotated */
  onKeyRotated?: (oldKey: string, newKey: string, agentId: string) => void | Promise<void>;
}

export interface AgentCredentials {
  agentId: string;
  apiKey: string;
  tenantId?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface StoredConfig {
  version: number;
  agents: Record<string, AgentCredentials>;
  defaultAgentId?: string;
}

export interface RateLimitError extends Error {
  code: 'RATE_LIMITED';
  limit: number;
  window: number;
  resetAt: Date;
  upgradeUrl?: string;
  retryAfter?: number;
}

export interface RegistrationError extends Error {
  code: 'REGISTRATION_FAILED' | 'INVALID_CREDENTIALS' | 'AGENT_NOT_FOUND';
  details?: string;
}

// ─── Storage Management ───────────────────────────────────────────────────────

/**
 * Get the default storage directory (~/.agentguard)
 */
export function getDefaultStoragePath(): string {
  return path.join(os.homedir(), CONFIG_DIR);
}

/**
 * Resolve storage path from options or default
 */
function resolveStoragePath(options: AutoRegisterOptions): string {
  return options.storagePath || getDefaultStoragePath();
}

/**
 * Load persisted config from storage path
 */
export function loadConfig(storagePath: string): StoredConfig | null {
  try {
    const configPath = path.join(storagePath, CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data) as StoredConfig;
  } catch (_error) {
    // Config might be corrupted - return null to trigger fresh registration
    return null;
  }
}

/**
 * Save config to storage path
 */
function saveConfig(storagePath: string, config: StoredConfig): void {
  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    const configPath = path.join(storagePath, CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save config: ${(error as Error).message}`);
  }
}

/**
 * Get credentials for a specific agent, or the default agent
 */
export function getAgentCredentials(
  storagePath: string,
  agentId?: string,
): AgentCredentials | null {
  const config = loadConfig(storagePath);
  if (!config) return null;
  
  const targetId = agentId || config.defaultAgentId;
  if (!targetId) return null;
  
  return config.agents[targetId] || null;
}

/**
 * Generate a unique agent identifier
 * Uses machine ID + timestamp + random suffix for uniqueness
 */
function generateAgentId(): string {
  const machineId = os.hostname() + '-' + os.platform() + '-' + os.arch();
  const hash = crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 8);
  const random = crypto.randomBytes(4).toString('hex');
  const timestamp = Date.now().toString(36);
  return `agt_${timestamp}-${hash}-${random}`;
}

// ─── API Communication ─────────────────────────────────────────────────────────

interface SignUpResponse {
  success: boolean;
  apiKey: string;
  agentId: string;
  tenantId?: string;
  message?: string;
}

interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

/**
 * Call the signup/register API endpoint
 * This is the key integration point - the SDK calls /signup internally
 */
async function registerAgent(
  baseUrl: string,
  agentId: string,
  agentName?: string,
): Promise<SignUpResponse> {
  const response = await fetch(`${baseUrl}/api/v1/auth/register-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId,
      name: agentName || `agent-${agentId}`,
      // For auto-registration, we use a device-bound token or anonymous signup
      // The server generates the API key
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as ApiErrorResponse;
    throw new Error(`Registration failed: ${response.status} - ${errorBody.error || response.statusText}`);
  }

  return response.json() as Promise<SignUpResponse>;
}

/**
 * Rotate an existing API key
 */
async function rotateApiKey(
  baseUrl: string,
  apiKey: string,
  agentId: string,
): Promise<{ apiKey: string; expiresAt: string }> {
  const response = await fetch(`${baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/rotate-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Key rotation failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<{ apiKey: string; expiresAt: string }>;
}

/**
 * Verify an API key is still valid
 */
async function validateApiKey(
  baseUrl: string,
  apiKey: string,
): Promise<{ valid: boolean; agentId?: string; tenantId?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    return response.json() as Promise<{ valid: boolean; agentId?: string; tenantId?: string }>;
  } catch {
    return { valid: false };
  }
}

/**
 * Parse rate limit error from API response
 */
function parseRateLimitError(response: Response): RateLimitError {
  const error = new Error('Rate limit exceeded') as RateLimitError;
  error.code = 'RATE_LIMITED';
  
  // Try to extract rate limit headers
  const limit = response.headers.get('X-RateLimit-Limit');
  const window = response.headers.get('X-RateLimit-Window');
  const reset = response.headers.get('X-RateLimit-Reset');
  const retryAfter = response.headers.get('Retry-After');
  
  if (limit) error.limit = parseInt(limit, 10);
  if (window) error.window = parseInt(window, 10);
  if (reset) error.resetAt = new Date(parseInt(reset, 10) * 1000);
  if (retryAfter) error.retryAfter = parseInt(retryAfter, 10);
  
  // Add upgrade URL for paid tier
  error.upgradeUrl = `${DEFAULT_BASE_URL}/upgrade?rate_limited=true`;
  
  return error;
}

// ─── Main Auto-Register Logic ───────────────────────────────────────────────

/**
 * Create an AgentGuard instance with auto-registration support.
 * 
 * This is the main entry point for agents that want to self-provision.
 * 
 * @param options - Configuration options
 * @returns Object with guard instance and metadata
 * 
 * @example
 * // Simple auto-register (creates account if needed)
 * const { guard, agentId, isNew } = await AgentGuard.autoRegister({
 *   autoRegister: true,
 *   agentName: 'my-ai-agent',
 * });
 * 
 * // Use the guard immediately
 * const decision = await guard.evaluate({ tool: 'file_read', params: {...} });
 * 
 * @example
 * // With custom storage and key rotation
 * const { guard } = await AgentGuard.autoRegister({
 *   autoRegister: true,
 *   agentName: 'production-agent',
 *   storagePath: '/etc/agentguard',
 *   rotateKey: true,
 *   onKeyRotated: async (oldKey, newKey, agentId) => {
 *     // Update your secret manager
 *     await secrets.update('agentguard-key', newKey);
 *   },
 * });
 */
export async function autoRegister(
  options: AutoRegisterOptions,
): Promise<{
  /** The ready-to-use AgentGuard instance */
  guard: AgentGuard;
  /** The agent ID */
  agentId: string;
  /** Whether a new account was created */
  isNew: boolean;
  /** The API key (for logging or storage) */
  apiKey: string;
}> {
  const {
    autoRegister = false,
    agentId: providedAgentId,
    agentName,
    storagePath: _storagePath, // raw path option; resolved below via resolveStoragePath()
    baseUrl = DEFAULT_BASE_URL,
    rotateKey = false,
    onKeyCreated,
    onKeyRotated,
  } = options;

  const resolvedStoragePath = resolveStoragePath(options);
  let agentId = providedAgentId || '';
  let apiKey = '';
  let isNew = false;

  // ─── Step 1: Check for existing credentials ────────────────────────────────
  const existingCredentials = getAgentCredentials(resolvedStoragePath, providedAgentId);

  if (existingCredentials) {
    // Validate existing key
    const validation = await validateApiKey(baseUrl, existingCredentials.apiKey);
    
    if (validation.valid) {
      // Key is valid - use it (with optional rotation)
      agentId = existingCredentials.agentId;
      apiKey = existingCredentials.apiKey;
      
      if (rotateKey) {
        console.log('[AgentGuard] Rotating existing API key...');
        const rotated = await rotateApiKey(baseUrl, apiKey, agentId);
        apiKey = rotated.apiKey;
        
        // Update stored credentials
        const config = loadConfig(resolvedStoragePath);
        const existingAgent = config?.agents[agentId];
        if (config && existingAgent) {
          existingAgent.apiKey = apiKey;
          if (rotated.expiresAt) {
            existingAgent.expiresAt = rotated.expiresAt;
          }
          saveConfig(resolvedStoragePath, config);
        }
        
        // Notify callback
        if (onKeyRotated) {
          await onKeyRotated(existingCredentials.apiKey, apiKey, agentId);
        }
      }
    } else {
      // Key is invalid/expired - need to re-register
      console.log('[AgentGuard] Existing key invalid, re-registering...');
      // Clear invalid credentials
      const config = loadConfig(resolvedStoragePath);
      if (config && providedAgentId && config.agents[providedAgentId]) {
        delete config.agents[providedAgentId];
        if (config.defaultAgentId === providedAgentId) {
          config.defaultAgentId = undefined;
        }
        saveConfig(resolvedStoragePath, config);
      }
    }
  }

  // ─── Step 2: Auto-register if needed ────────────────────────────────────────
  if (!apiKey && autoRegister) {
    // Generate a new agent ID if we don't have one
    agentId = providedAgentId || generateAgentId();
    
    console.log(`[AgentGuard] Auto-registering agent: ${agentId}`);
    
    // Call the registration API
    const registration = await registerAgent(baseUrl, agentId, agentName);
    apiKey = registration.apiKey;
    isNew = true;

    // ─── Step 3: Persist credentials ─────────────────────────────────────────
    const credentials: AgentCredentials = {
      agentId,
      apiKey,
      tenantId: registration.tenantId,
      createdAt: new Date().toISOString(),
    };

    // Load or create config
    let config = loadConfig(resolvedStoragePath);
    if (!config) {
      config = { version: 1, agents: {} };
    }

    // Store for this agent
    config.agents[agentId] = credentials;
    if (!config.defaultAgentId) {
      config.defaultAgentId = agentId;
    }

    saveConfig(resolvedStoragePath, config);

    // Notify callback
    if (onKeyCreated) {
      await onKeyCreated(apiKey, agentId);
    }
  }

  // ─── Step 3: Create and return the guard ───────────────────────────────────
  if (!apiKey) {
    throw new Error(
      'No API key available. Provide apiKey or set autoRegister: true to self-provision.'
    );
  }

  const guard = new AgentGuard({ apiKey, baseUrl });

  return {
    guard,
    agentId,
    isNew,
    apiKey,
  };
}

// ─── AgentGuard Extension ─────────────────────────────────────────────────────

// We need to import the original AgentGuard class
// In a real implementation, this would be imported from './client'
// For this file to be self-contained, we'll define a minimal version

/**
 * Minimal AgentGuard client for auto-register module
 * Re-exports the full client for actual use
 */
class AgentGuard {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  }

  /**
   * Evaluate an action against the policy engine
   * Includes automatic rate limit detection and error handling
   */
  async evaluate(action: {
    tool: string;
    params?: Record<string, unknown>;
  }): Promise<{
    result: 'allow' | 'block' | 'monitor' | 'require_approval';
    matchedRuleId?: string;
    riskScore: number;
    reason: string;
    durationMs: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(action),
    });

    // Handle rate limit errors with rich context
    if (res.status === 429) {
      throw parseRateLimitError(res);
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({})) as ApiErrorResponse;
      throw new Error(
        `AgentGuard API error: ${res.status} - ${errorBody.error || res.statusText}`
      );
    }

    return res.json() as Promise<{
      result: 'allow' | 'block' | 'monitor' | 'require_approval';
      matchedRuleId?: string;
      riskScore: number;
      reason: string;
      durationMs: number;
    }>;
  }

  /**
   * Get current usage statistics
   */
  async getUsage(): Promise<{
    requestsThisMonth: number;
    limit: number;
    agentId: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/usage`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (res.status === 429) {
      throw parseRateLimitError(res);
    }

    if (!res.ok) {
      throw new Error(`AgentGuard API error: ${res.status}`);
    }

    return res.json() as Promise<{
      requestsThisMonth: number;
      limit: number;
      agentId: string;
    }>;
  }

  /**
   * Get the raw API key (for external storage)
   */
  getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Check if currently rate limited
   */
  async checkRateLimit(): Promise<{
    limited: boolean;
    limit: number;
    remaining: number;
    resetAt: Date;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limit/status`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (res.status === 429) {
      return {
        limited: true,
        limit: 0,
        remaining: 0,
        resetAt: new Date(),
      };
    }

    const data = await res.json() as {
      limited: boolean;
      limit: number;
      remaining: number;
      resetAt: string;
    };

    return {
      ...data,
      resetAt: new Date(data.resetAt),
    };
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Clear all stored credentials
 * Useful for testing or when agent needs a fresh start
 */
export async function clearCredentials(storagePath?: string): Promise<void> {
  const resolvedPath = storagePath || getDefaultStoragePath();
  const configPath = path.join(resolvedPath, CONFIG_FILE);
  
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

/**
 * List all registered agents
 */
export function listAgents(storagePath?: string): AgentCredentials[] {
  const resolvedPath = storagePath || getDefaultStoragePath();
  const config = loadConfig(resolvedPath);
  
  if (!config) return [];
  
  return Object.values(config.agents);
}

/**
 * Get or create a guard for a specific agent
 * Returns existing guard if agent already registered
 */
export async function getOrCreateGuard(
  agentId: string,
  options?: Omit<AutoRegisterOptions, 'agentId' | 'autoRegister'> & { autoRegister?: boolean },
): Promise<{
  guard: AgentGuard;
  agentId: string;
  isNew: boolean;
  apiKey: string;
}> {
  const resolvedStoragePath = resolveStoragePath(options || {});
  const existing = getAgentCredentials(resolvedStoragePath, agentId);
  
  if (existing) {
    const guard = new AgentGuard({ 
      apiKey: existing.apiKey, 
      baseUrl: options?.baseUrl 
    });
    return { guard, agentId, isNew: false, apiKey: existing.apiKey };
  }
  
  // Agent not found - auto-register if enabled
  if (options?.autoRegister) {
    return autoRegister({ ...options, agentId });
  }
  
  throw new Error(`Agent '${agentId}' not found. Set autoRegister: true to create.`);
}

/**
 * Gracefully handle rate limit errors with retry logic
 * 
 * @example
 * const decision = await withRetry(() => guard.evaluate({ tool, params }), {
 *   maxRetries: 3,
 *   baseDelayMs: 1000,
 *   onRateLimit: (error) => {
 *     console.log('Rate limited, waiting...');
 *   },
 * });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    onRateLimit?: (error: RateLimitError, retryCount: number) => void;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if ((error as RateLimitError).code === 'RATE_LIMITED') {
        const rateError = error as RateLimitError;
        
        if (attempt < maxRetries) {
          // Use retry-after header if available, otherwise exponential backoff
          const delayMs = rateError.retryAfter 
            ? rateError.retryAfter * 1000 
            : baseDelayMs * Math.pow(2, attempt);
          
          if (options?.onRateLimit) {
            options.onRateLimit(rateError, attempt);
          }
          
          console.log(`[AgentGuard] Rate limited, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Out of retries - add upgrade suggestion
        if (rateError.upgradeUrl) {
          console.error(`[AgentGuard] Rate limit exceeded. Upgrade at: ${rateError.upgradeUrl}`);
        }
      }
      
      // Non-rate-limit error or out of retries
      throw error;
    }
  }
  
  throw lastError;
}

// ─── Rate Limit Helper ───────────────────────────────────────────────────────

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return (error as RateLimitError)?.code === 'RATE_LIMITED';
}

/**
 * Format rate limit error for display
 */
export function formatRateLimitError(error: RateLimitError): string {
  let message = `Rate limit exceeded. `;
  
  if (error.limit && error.window) {
    message += `Limit: ${error.limit} requests per ${error.window}s. `;
  }
  
  if (error.resetAt) {
    message += `Resets at: ${error.resetAt.toISOString()}. `;
  }
  
  if (error.upgradeUrl) {
    message += `\nUpgrade: ${error.upgradeUrl}`;
  }
  
  return message;
}
