/**
 * AgentGuard — Prompt Injection Detection Types
 *
 * Plugin interface for detection providers (heuristic, Lakera, custom).
 */

export interface DetectionResult {
  detected: boolean;
  score: number;        // 0.0 – 1.0
  category: string;     // 'prompt_injection' | 'jailbreak' | 'safe'
  provider: string;     // 'heuristic' | 'lakera' | 'custom'
}

export interface DetectionInput {
  toolName: string;
  toolInput: Record<string, unknown>;
  messageHistory?: Array<{ role: string; content: string }>;
}

export interface DetectionPlugin {
  name: string;
  detect(input: DetectionInput): Promise<DetectionResult>;
}
