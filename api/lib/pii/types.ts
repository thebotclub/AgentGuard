/**
 * AgentGuard — PII Detection Plugin Interface
 *
 * Defines the shared types for PII detection entities, scan results,
 * and the plugin interface that all PII detectors must implement.
 */

export interface PIIEntity {
  /** PII type: 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD' | 'NAME' | 'ADDRESS' | 'IP_ADDRESS' | 'DATE_OF_BIRTH' */
  type: string;
  /** Character offset (start) in original content */
  start: number;
  /** Character offset (end, exclusive) in original content */
  end: number;
  /** Confidence score: 0.0 – 1.0 */
  score: number;
  /** The matched text — in-memory only, NEVER stored in the database */
  text: string;
}

export interface PIIScanResult {
  /** Total number of PII entities found */
  entitiesFound: number;
  /** Array of detected PII entities (in-memory only) */
  entities: PIIEntity[];
  /** Content with all PII replaced by deterministic placeholders */
  redactedContent: string;
}

export interface PIIPlugin {
  /** Human-readable plugin identifier */
  name: string;
  /** Scan content and return detected entities + redacted version */
  scan(content: string): Promise<PIIScanResult>;
}
