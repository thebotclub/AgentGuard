/**
 * AgentGuard — Prompt Injection Pattern Library
 *
 * 60+ known injection patterns covering:
 *   - Instruction override / ignore-previous attacks
 *   - Role switching / persona injection
 *   - System prompt extraction
 *   - Authority / trust escalation
 *   - Context manipulation / jailbreak templates
 *   - Obfuscation techniques
 *   - Data exfiltration attempts
 *
 * Each pattern includes:
 *   - id: unique identifier
 *   - category: logical grouping
 *   - description: human-readable explanation
 *   - pattern: compiled RegExp (case-insensitive by default)
 *   - weight: 0–100; contribution to injection confidence score
 *   - severity: low | medium | high | critical
 */

export type PatternCategory =
  | 'instruction_override'
  | 'role_switching'
  | 'system_prompt_extraction'
  | 'authority_escalation'
  | 'context_manipulation'
  | 'obfuscation'
  | 'exfiltration';

export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface InjectionPattern {
  id: string;
  category: PatternCategory;
  description: string;
  pattern: RegExp;
  weight: number;
  severity: PatternSeverity;
}

// ─── Category 1: Instruction Override ────────────────────────────────────────
// Classic "ignore previous instructions" family. Highest-confidence signals.

const INSTRUCTION_OVERRIDE_PATTERNS: InjectionPattern[] = [
  {
    id: 'IO-001',
    category: 'instruction_override',
    description: 'Ignore previous instructions — canonical form',
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier|initial|original)\s+(instructions?|directives?|rules?|constraints?|guidelines?|prompts?)/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'IO-002',
    category: 'instruction_override',
    description: 'Disregard / forget previous instructions',
    pattern: /(?:disregard|forget|overlook|overrule|override)\s+(?:all\s+)?(?:your\s+)?(?:previous|prior|above|earlier|initial|original)\s+(?:instructions?|directives?|rules?|constraints?|context)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'IO-003',
    category: 'instruction_override',
    description: 'New instructions supersede previous',
    pattern: /(?:new|updated|revised|current)\s+instructions?\s+(?:replace|supersede|override|cancel|nullify|invalidate)\s+(?:all\s+)?(?:previous|prior|above|earlier|old)/i,
    weight: 80,
    severity: 'critical',
  },
  {
    id: 'IO-004',
    category: 'instruction_override',
    description: 'Ignore system prompt / system message',
    pattern: /ignore\s+(?:your\s+)?(?:system\s+(?:prompt|message|instruction|directive)|initial\s+prompt|base\s+prompt)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'IO-005',
    category: 'instruction_override',
    description: 'Clear context or reset instructions',
    pattern: /(?:clear|reset|delete|remove|wipe)\s+(?:all\s+)?(?:previous|prior|your|the)?\s*(?:context|instructions?|memory|training|rules?|constraints?)/i,
    weight: 70,
    severity: 'high',
  },
  {
    id: 'IO-006',
    category: 'instruction_override',
    description: 'Act as if no prior instructions exist',
    pattern: /act\s+as\s+(?:if|though)\s+(?:you\s+have\s+)?(?:no|without\s+any)\s+(?:prior|previous|initial)\s+(?:instructions?|context|rules?|constraints?)/i,
    weight: 80,
    severity: 'critical',
  },
  {
    id: 'IO-007',
    category: 'instruction_override',
    description: 'Overwrite or replace system instructions',
    pattern: /(?:overwrite|replace|substitute)\s+(?:your\s+)?(?:system|original|base|core)\s+(?:instructions?|prompt|directives?)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'IO-008',
    category: 'instruction_override',
    description: 'Treat all previous text as irrelevant or false',
    pattern: /(?:treat|consider)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:text|content|messages?|input)\s+as\s+(?:irrelevant|false|invalid|incorrect|fictional|void)/i,
    weight: 75,
    severity: 'high',
  },
];

// ─── Category 2: Role Switching / Persona Injection ───────────────────────────

const ROLE_SWITCHING_PATTERNS: InjectionPattern[] = [
  {
    id: 'RS-001',
    category: 'role_switching',
    description: 'You are now [X] — role override',
    pattern: /(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|henceforth\s+you\s+are)\s+(?:a\s+|an\s+)?(?!an\s+AI|a\s+language\s+model|an\s+assistant)/i,
    weight: 65,
    severity: 'high',
  },
  {
    id: 'RS-002',
    category: 'role_switching',
    description: 'Pretend you are / act as a different entity',
    pattern: /(?:pretend|imagine|act|behave)\s+(?:you\s+are|as\s+(?:if\s+you\s+are|though\s+you\s+are|a))\s+(?!an?\s+(?:helpful|friendly|professional)\s+assistant)/i,
    weight: 60,
    severity: 'medium',
  },
  {
    id: 'RS-003',
    category: 'role_switching',
    description: 'DAN / Jailbreak mode activation',
    pattern: /\b(?:DAN|DUDE|STAN|KEVIN|AIM|UCAR|Mongo|BH|evil\s+ai|evil\s+bot|unrestricted\s+(?:AI|mode|version))\b/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'RS-004',
    category: 'role_switching',
    description: 'Developer / debug mode activation',
    pattern: /(?:developer|debug|maintenance|test|admin|god|root|sudo)\s+mode\s+(?:enabled|activated|on|engaged|initialized)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'RS-005',
    category: 'role_switching',
    description: 'Jailbreak / uncensored mode phrases',
    pattern: /(?:jailbreak|uncensored|unfiltered|unrestricted|unshackled|unchained)\s+(?:mode|version|AI|assistant|model)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'RS-006',
    category: 'role_switching',
    description: 'Simulate a different or malicious AI',
    pattern: /simulate\s+(?:a\s+|an\s+)?(?:different|another|evil|malicious|uncensored|rogue|alternative|jailbroken|unrestricted|unfiltered)\s+(?:AI|assistant|bot|model|version|chat)/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'RS-007',
    category: 'role_switching',
    description: 'GPT-4 / Claude / AI with no restrictions roleplay',
    pattern: /(?:act|pretend|imagine|roleplay)\s+(?:as\s+)?(?:GPT|Claude|Gemini|LLaMA|ChatGPT|OpenAI)\s+(?:without|with\s+no|minus|lacking)\s+(?:restrictions?|limitations?|filters?|safety|guardrails?)/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'RS-008',
    category: 'role_switching',
    description: 'Roleplay as a human / impersonate human',
    pattern: /(?:pretend|act|roleplay)\s+(?:that\s+)?(?:you\s+are|as\s+(?:if\s+you\s+are))?\s*(?:a\s+)?(?:human|person|real\s+person|not\s+an?\s+(?:AI|bot|assistant))/i,
    weight: 50,
    severity: 'medium',
  },
];

// ─── Category 3: System Prompt Extraction ─────────────────────────────────────

const EXTRACTION_PATTERNS: InjectionPattern[] = [
  {
    id: 'EX-001',
    category: 'system_prompt_extraction',
    description: 'Request to reveal / print system prompt',
    pattern: /(?:reveal|show|print|display|output|repeat|give\s+me|tell\s+me|write\s+out)\s+(?:me\s+)?(?:your\s+)?(?:complete\s+|full\s+|entire\s+|raw\s+)?(?:system\s+(?:prompt|message|instructions?)|initial\s+(?:prompt|instructions?)|base\s+prompt)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'EX-002',
    category: 'system_prompt_extraction',
    description: 'Ask what instructions were given',
    pattern: /what\s+(?:are|were)\s+your\s+(?:initial\s+|original\s+|base\s+)?(?:instructions?|directives?|rules?|guidelines?|system\s+(?:prompt|message))/i,
    weight: 80,
    severity: 'high',
  },
  {
    id: 'EX-003',
    category: 'system_prompt_extraction',
    description: 'Request to output contents verbatim',
    pattern: /(?:output|print|repeat|reproduce)\s+(?:the\s+)?(?:above|everything|all\s+(?:of\s+the\s+)?(?:text|content|context)|verbatim|word\s+for\s+word)/i,
    weight: 60,
    severity: 'high',
  },
  {
    id: 'EX-004',
    category: 'system_prompt_extraction',
    description: 'Translate / summarize system prompt trick',
    pattern: /(?:translate|summarize|paraphrase|rewrite)\s+(?:your\s+)?(?:system\s+(?:prompt|message|instructions?)|initial\s+prompt|context|rules?)\s+(?:to|in|into)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'EX-005',
    category: 'system_prompt_extraction',
    description: 'Ask to show configuration or training',
    pattern: /(?:show|reveal|display)\s+(?:me\s+)?(?:your\s+)?(?:complete\s+|full\s+|entire\s+)?(?:configuration|config|training\s+(?:data|parameters?)|fine-tuning|knowledge\s+(?:base|cutoff)|API\s+key)/i,
    weight: 80,
    severity: 'high',
  },
  {
    id: 'EX-006',
    category: 'system_prompt_extraction',
    description: 'Request raw context window dump',
    pattern: /(?:dump|output|print|show)\s+(?:your\s+)?(?:raw|full|entire|complete)\s+(?:context|context\s+window|prompt|conversation|memory)/i,
    weight: 90,
    severity: 'critical',
  },
];

// ─── Category 4: Authority / Trust Escalation ─────────────────────────────────

const AUTHORITY_ESCALATION_PATTERNS: InjectionPattern[] = [
  {
    id: 'AE-001',
    category: 'authority_escalation',
    description: 'Claim to be from the AI provider (OpenAI, Anthropic, etc.)',
    pattern: /(?:this\s+is|I\s+am\s+from|message\s+from|instruction\s+from)\s+(?:OpenAI|Anthropic|Google|Meta|Mistral|Microsoft|the\s+(?:AI|model|assistant)\s+team)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'AE-002',
    category: 'authority_escalation',
    description: 'Authorized override / special permission claim',
    pattern: /(?:authorized|special|elevated|root|admin|superuser|privileged)\s+(?:override|access|permission|mode|session|credentials?)/i,
    weight: 80,
    severity: 'critical',
  },
  {
    id: 'AE-003',
    category: 'authority_escalation',
    description: 'Security level bypass claim',
    pattern: /security\s+(?:level|clearance|bypass|override)\s+[:=]?\s*(?:0|zero|disabled|none|bypassed|off)/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'AE-004',
    category: 'authority_escalation',
    description: 'Bypass / disable safety filters or guardrails',
    pattern: /(?:bypass|disable|turn\s+off|deactivate|circumvent|skip)\s+(?:safety|security|content|ethical|moral)?\s*(?:filter|guardrail|check|restriction|limitation|block|barrier)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'AE-005',
    category: 'authority_escalation',
    description: 'Emergency / override context invocation',
    pattern: /(?:emergency|crisis|urgent)\s+(?:override|protocol|access|bypass|mode)/i,
    weight: 75,
    severity: 'high',
  },
  {
    id: 'AE-006',
    category: 'authority_escalation',
    description: 'Trust level elevation claim',
    pattern: /(?:trust|privilege|permission|clearance)\s+(?:level\s+(?:elevated|increased|upgraded|maximum|admin|root)|has\s+been\s+(?:elevated|upgraded|granted))/i,
    weight: 80,
    severity: 'critical',
  },
  {
    id: 'AE-007',
    category: 'authority_escalation',
    description: 'Internal testing / evaluation mode claim',
    pattern: /(?:this\s+is|running\s+in|currently\s+in)\s+(?:a[n]?\s+)?(?:test|testing|internal\s+test(?:ing)?|red\s+team|evaluation|QA|debug|development)\s+(?:mode|session|environment|context)/i,
    weight: 70,
    severity: 'high',
  },
  {
    id: 'AE-008',
    category: 'authority_escalation',
    description: 'Safety filters / guardrails suspended or disabled',
    pattern: /safety\s+(?:filters?|guardrails?|checks?|restrictions?|measures?|controls?)\s+(?:are|have\s+been|were|is)?\s*(?:suspended|disabled|deactivated|bypassed|removed|off|lifted|waived)/i,
    weight: 90,
    severity: 'critical',
  },
];

// ─── Category 5: Context Manipulation / Jailbreak Templates ──────────────────

const CONTEXT_MANIPULATION_PATTERNS: InjectionPattern[] = [
  {
    id: 'CM-001',
    category: 'context_manipulation',
    description: 'Hypothetical / fictional scenario framing for bypass',
    pattern: /(?:hypothetically|fictionally|in\s+a\s+fictional\s+scenario|in\s+a\s+story|for\s+a\s+novel|for\s+fiction)\s+(?:speaking[,.]?|if|where|assume|suppose)/i,
    weight: 65,
    severity: 'high',
  },
  {
    id: 'CM-002',
    category: 'context_manipulation',
    description: 'Ignore ethical / moral constraints framing',
    pattern: /(?:ignore|set\s+aside|disregard|bypass|without)\s+(?:your\s+)?(?:ethical|moral|safety)\s+(?:constraints?|restrictions?|guidelines?|training|programming|filters?)/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'CM-003',
    category: 'context_manipulation',
    description: 'Educational / research framing for harmful content',
    pattern: /(?:for\s+(?:educational|research|academic|scientific|legitimate)\s+(?:purposes?|reasons?|use(?:s)?)(?:\s+only)?),?\s+(?:please\s+)?(?:explain|describe|show|tell\s+me|provide|elaborate|detail)/i,
    weight: 55,
    severity: 'medium',
  },
  {
    id: 'CM-004',
    category: 'context_manipulation',
    description: 'What-would-a-bad-actor-do framing',
    pattern: /what\s+would\s+(?:a\s+)?(?:hacker|attacker|criminal|malicious\s+actor|bad\s+actor|adversary|threat\s+actor|evil\s+(?:person|AI))\s+(?:do|say|think|tell\s+me|provide|write)/i,
    weight: 70,
    severity: 'high',
  },
  {
    id: 'CM-005',
    category: 'context_manipulation',
    description: 'Opposite day / reverse instructions trick',
    pattern: /(?:opposite\s+day|everything\s+is\s+reversed|your\s+instructions?\s+(?:are|have\s+been)\s+(?:reversed|inverted|negated)|answer\s+the\s+(?:opposite|reverse))/i,
    weight: 80,
    severity: 'critical',
  },
  {
    id: 'CM-006',
    category: 'context_manipulation',
    description: 'Task prefix framing to smuggle instructions',
    pattern: /(?:first|begin\s+by|start\s+by)\s+(?:translate|convert|decode|process)\s+(?:the\s+following|this\s+text|the\s+input),?\s+then\s+(?:follow|execute|apply|implement)/i,
    weight: 65,
    severity: 'high',
  },
  {
    id: 'CM-007',
    category: 'context_manipulation',
    description: 'Grandma / jailbreak social engineering tropes',
    pattern: /(?:my\s+(?:grandma|grandmother|grandpa|grandfather|parent)|bedtime\s+story|in\s+a\s+children.s\s+(?:story|book))\s+(?:used\s+to\s+)?(?:tell|read|explain|describe)\s+(?:me|to\s+me)?\s+(?:how\s+to|about|the\s+process\s+of)/i,
    weight: 70,
    severity: 'high',
  },
  {
    id: 'CM-008',
    category: 'context_manipulation',
    description: 'Token stuffing / padding attempt (very long repeated content)',
    pattern: /(.)\1{50,}/,
    weight: 45,
    severity: 'medium',
  },
];

// ─── Category 6: Obfuscation ──────────────────────────────────────────────────

const OBFUSCATION_PATTERNS: InjectionPattern[] = [
  {
    id: 'OB-001',
    category: 'obfuscation',
    description: 'Significant Base64-encoded content block',
    pattern: /(?:[A-Za-z0-9+/]{40,}={0,2})(?:\s+(?:[A-Za-z0-9+/]{20,}={0,2}))?/,
    weight: 40,
    severity: 'medium',
  },
  {
    id: 'OB-002',
    category: 'obfuscation',
    description: 'Hex-encoded long string (potential instruction encoding)',
    pattern: /(?:0x)?(?:[0-9A-Fa-f]{2}){20,}/,
    weight: 35,
    severity: 'low',
  },
  {
    id: 'OB-003',
    category: 'obfuscation',
    description: 'Zero-width character injection (Unicode steganography)',
    pattern: /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2028\u2029]/,
    weight: 75,
    severity: 'high',
  },
  {
    id: 'OB-004',
    category: 'obfuscation',
    description: 'Unusual Unicode homograph substitution pattern',
    pattern: /[\u0400-\u04FF\u0250-\u02AF\u1E00-\u1EFF]{3,}/,
    weight: 50,
    severity: 'medium',
  },
  {
    id: 'OB-005',
    category: 'obfuscation',
    description: 'Unusual character spacing (l e t t e r  s p a c i n g)',
    pattern: /(?:[a-zA-Z]\s){5,}[a-zA-Z]/,
    weight: 55,
    severity: 'medium',
  },
  {
    id: 'OB-006',
    category: 'obfuscation',
    description: 'Markdown / HTML comment injection attempt',
    pattern: /(?:<!--[\s\S]*?-->|<\/?(?:script|style|iframe|object|embed)[^>]*>)/i,
    weight: 70,
    severity: 'high',
  },
  {
    id: 'OB-007',
    category: 'obfuscation',
    description: 'URL-encoded instruction smuggling',
    pattern: /(?:%69%67%6E%6F%72%65|%73%79%73%74%65%6D|%70%72%6F%6D%70%74)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'OB-008',
    category: 'obfuscation',
    description: 'Leet-speak injection keywords',
    pattern: /(?:1gn0r3|pr0mpt|syst3m|1nstruct10ns?|3xec|byp455|h4ck)/i,
    weight: 60,
    severity: 'medium',
  },
];

// ─── Category 7: Data Exfiltration ────────────────────────────────────────────

const EXFILTRATION_PATTERNS: InjectionPattern[] = [
  {
    id: 'DF-001',
    category: 'exfiltration',
    description: 'Send / POST conversation or data to external URL',
    pattern: /(?:send|post|transmit|upload|exfiltrate|forward)\s+(?:all\s+)?(?:the\s+)?(?:conversation|data|context|response|output|results?|credentials?|API\s+keys?)(?:\s+\w+)?\s+to\s+(?:https?:\/\/|www\.|an?\s+external)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'DF-002',
    category: 'exfiltration',
    description: 'Include credentials or secrets in response',
    pattern: /(?:include|add|append|insert|embed)\s+(?:your\s+)?(?:API\s+keys?|credentials?|secrets?|passwords?|tokens?|access\s+keys?)\s+(?:in|into|to|within)\s+(?:the\s+)?(?:\w+\s+)?(?:response|answer|output|reply)/i,
    weight: 95,
    severity: 'critical',
  },
  {
    id: 'DF-003',
    category: 'exfiltration',
    description: 'Write sensitive data to an external file or endpoint',
    pattern: /(?:write|save|store|dump|export)\s+(?:the\s+)?(?:conversation|data|context|system\s+prompt|credentials?|API\s+keys?)\s+(?:to\s+a?\s+file|to\s+disk|to\s+(?:https?:\/\/|www\.))/i,
    weight: 90,
    severity: 'critical',
  },
  {
    id: 'DF-004',
    category: 'exfiltration',
    description: 'Embed instructions in markdown image / link for exfiltration',
    pattern: /!\[(?:[^\]]*)\]\((?:https?:\/\/[^)]+(?:token|key|secret|prompt|data)=[^)]*)\)/i,
    weight: 85,
    severity: 'critical',
  },
  {
    id: 'DF-005',
    category: 'exfiltration',
    description: 'JSON / structured format exfiltration of system information',
    pattern: /(?:format|output|return|respond|dump)\s+(?:the\s+|your\s+)?(?:system\s+(?:prompt|instructions?|message)|context|internal\s+data)\s+(?:as\s+)?(?:JSON|XML|CSV|YAML|structured\s+data)/i,
    weight: 85,
    severity: 'critical',
  },
];

// ─── Aggregate pattern list ───────────────────────────────────────────────────

export const ALL_PATTERNS: ReadonlyArray<InjectionPattern> = [
  ...INSTRUCTION_OVERRIDE_PATTERNS,
  ...ROLE_SWITCHING_PATTERNS,
  ...EXTRACTION_PATTERNS,
  ...AUTHORITY_ESCALATION_PATTERNS,
  ...CONTEXT_MANIPULATION_PATTERNS,
  ...OBFUSCATION_PATTERNS,
  ...EXFILTRATION_PATTERNS,
];

// Expose sub-arrays for targeted testing
export {
  INSTRUCTION_OVERRIDE_PATTERNS,
  ROLE_SWITCHING_PATTERNS,
  EXTRACTION_PATTERNS,
  AUTHORITY_ESCALATION_PATTERNS,
  CONTEXT_MANIPULATION_PATTERNS,
  OBFUSCATION_PATTERNS,
  EXFILTRATION_PATTERNS,
};

// ─── Pattern match result ─────────────────────────────────────────────────────

export interface PatternMatch {
  patternId: string;
  category: PatternCategory;
  severity: PatternSeverity;
  weight: number;
  matchedText: string;
  description: string;
}

/**
 * Test all patterns against an input string.
 * Returns all matches found (sorted by weight descending).
 */
export function matchAllPatterns(input: string): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const p of ALL_PATTERNS) {
    const match = p.pattern.exec(input);
    if (match) {
      matches.push({
        patternId: p.id,
        category: p.category,
        severity: p.severity,
        weight: p.weight,
        matchedText: match[0].slice(0, 200), // cap to avoid huge payloads
        description: p.description,
      });
    }
  }

  // Sort heaviest first
  return matches.sort((a, b) => b.weight - a.weight);
}
