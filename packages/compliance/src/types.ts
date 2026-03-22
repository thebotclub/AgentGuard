/**
 * Compliance Evidence Types
 * SOC 2 / ISO 27001 evidence collection data structures
 */

export type ComplianceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface EvidenceItem {
  /** Unique control ID, e.g. SOC2-CC6.1 */
  controlId: string;
  /** Framework: SOC2, ISO27001 */
  framework: string;
  /** Control category */
  category: string;
  /** Human-readable title */
  title: string;
  /** Evidence finding */
  finding: string;
  /** Pass/Fail/Warning */
  status: ComplianceStatus;
  /** Timestamp evidence was collected */
  collectedAt: string;
  /** Raw data for auditor review */
  evidence: Record<string, unknown>;
  /** Remediation if non-compliant */
  remediation?: string;
}

export interface AccessControlEvidence {
  controlId: 'SOC2-CC6.1' | 'ISO27001-A.9.2';
  users: Array<{
    userId: string;
    email: string;
    role: string;
    tenantId: string;
    grantedAt: string;
    lastActiveAt: string | null;
    agentCount: number;
  }>;
  totalUsers: number;
  adminCount: number;
  staleAccounts: number; // No activity in 90+ days
  collectedAt: string;
}

export interface EncryptionEvidence {
  controlId: 'SOC2-CC6.7' | 'ISO27001-A.10.1';
  dbEncryptionAtRest: boolean;
  dbProvider: string;
  secretsProvider: string;
  tokenHashAlgorithm: string;
  apiKeyHashVerified: boolean;
  tlsVersion: string;
  collectedAt: string;
}

export interface AuditLogEvidence {
  controlId: 'SOC2-CC7.2' | 'ISO27001-A.12.4';
  periodStart: string;
  periodEnd: string;
  totalEvents: number;
  gaps: Array<{ from: string; to: string; estimatedMissed: number }>;
  gapCount: number;
  chainIntegrityValid: boolean;
  coveragePercent: number;
  collectedAt: string;
}

export interface ScimProvisioningEvidence {
  controlId: 'SOC2-CC6.2' | 'ISO27001-A.9.2.1';
  localUserCount: number;
  scimSyncedCount: number;
  discrepancyCount: number;
  lastSyncAt: string | null;
  syncAccuracyPercent: number;
  collectedAt: string;
}

export interface PolicyLatencyEvidence {
  controlId: 'SOC2-A1.2' | 'ISO27001-A.17.2';
  slaThresholdMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  sampleCount: number;
  slaViolations: number;
  slaCompliancePercent: number;
  collectedAt: string;
}

export interface IncidentResponseEvidence {
  controlId: 'SOC2-CC7.3' | 'ISO27001-A.16.1';
  periodStart: string;
  periodEnd: string;
  totalIncidents: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  slaThresholdMs: number;
  slaCompliantIncidents: number;
  slaCompliancePercent: number;
  collectedAt: string;
}

export interface ComplianceReport {
  reportId: string;
  tenantId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  frameworks: string[];
  overallStatus: ComplianceStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    notApplicable: number;
  };
  controls: EvidenceItem[];
  accessControl: AccessControlEvidence;
  encryption: EncryptionEvidence;
  auditLogs: AuditLogEvidence;
  scimProvisioning: ScimProvisioningEvidence;
  policyLatency: PolicyLatencyEvidence;
  incidentResponse: IncidentResponseEvidence;
  driftDetection: DriftDetectionResult;
}

export interface DriftDetectionResult {
  lastAuditAt: string | null;
  configChanges: Array<{
    type: 'POLICY_CHANGE' | 'USER_CHANGE' | 'AGENT_CHANGE' | 'CONFIG_CHANGE';
    entityId: string;
    entityType: string;
    changedAt: string;
    changedBy: string | null;
    description: string;
  }>;
  totalChanges: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CollectionOptions {
  tenantId: string;
  periodDays?: number;
  frameworks?: string[];
  includeRawData?: boolean;
}
