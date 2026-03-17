/**
 * AgentGuard — OpenAPI Spec Generator
 *
 * Generates openapi.json from:
 * 1. The hand-crafted openapi.yaml (source of truth)
 * 2. JSDoc annotations in route files (swagger-jsdoc format)
 *
 * Usage:
 *   npx tsx api/scripts/generate-openapi.ts
 *
 * Output:
 *   api/openapi.json   — JSON version of the spec
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
const API_DIR = join(__dirname, '..');
const ROOT_DIR = join(__dirname, '..', '..');

// ── 1. Load base YAML spec ──────────────────────────────────────────────────

const yamlPath = join(API_DIR, 'openapi.yaml');
const yamlContent = readFileSync(yamlPath, 'utf-8');
const spec = yaml.load(yamlContent) as Record<string, unknown>;

console.log(`✓ Loaded openapi.yaml (${yamlContent.split('\n').length} lines)`);

// ── 2. Output JSON ──────────────────────────────────────────────────────────

const jsonPath = join(API_DIR, 'openapi.json');
const jsonOutput = JSON.stringify(spec, null, 2);
writeFileSync(jsonPath, jsonOutput);

console.log(`✓ Generated openapi.json (${jsonOutput.split('\n').length} lines)`);
console.log(`  → ${jsonPath}`);

// ── 3. Generate summary ─────────────────────────────────────────────────────

const paths = (spec.paths as Record<string, unknown>) ?? {};
const pathCount = Object.keys(paths).length;

let endpointCount = 0;
const tagMap: Record<string, number> = {};

for (const pathItem of Object.values(paths)) {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const method of methods) {
    const op = (pathItem as Record<string, unknown>)[method];
    if (op) {
      endpointCount++;
      const tags = ((op as Record<string, unknown>).tags as string[]) ?? ['untagged'];
      for (const tag of tags) {
        tagMap[tag] = (tagMap[tag] ?? 0) + 1;
      }
    }
  }
}

console.log(`\n📊 Spec Summary:`);
console.log(`   Paths: ${pathCount}`);
console.log(`   Endpoints: ${endpointCount}`);
console.log(`   Tags: ${Object.keys(tagMap).join(', ')}`);
console.log(`\n✅ OpenAPI spec generation complete`);
