// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import securityPlugin from 'eslint-plugin-security';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base JS recommended rules (applied as foundation; several are overridden below for TS files)
  js.configs.recommended,

  // Global ignores — never lint these
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.js',        // ignore compiled output
      'remotion/**',    // isolated workspace, different TS config
      'packages/python/**',
      'infra/**',
      'helm/**',
      'landing/**',
      'dashboard/**',
      'docs-site/**',
      'demo/**',
      'about/**',
      'blog/**',
    ],
  },

  // TypeScript files in api/ and packages/
  {
    files: ['api/**/*.ts', 'packages/*/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        // Node.js core globals
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        JSON: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // CommonJS (used in CJS-style imports in sdk/auto-register)
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        // Modern Node.js globals (Node 18+)
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        RequestInit: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        // Node.js performance API (available as global since Node 16)
        performance: 'readonly',
        // Node.js crypto global (distinct from the 'crypto' import)
        crypto: 'readonly',
        // Web API globals available in Node 15+
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // Node.js global object reference
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'security': securityPlugin,
    },
    rules: {
      // ── Base JS rules disabled for TypeScript files ──────────────────────
      // TypeScript's compiler already catches undefined references (tsc --noEmit
      // runs in CI), so the base no-undef rule just produces false positives for
      // TypeScript type-only references (e.g. `RequestInit`, `Response`).
      'no-undef': 'off',

      // The base no-unused-vars fires on TypeScript interface method parameter
      // names (which are documentation-only) and conflicts with the TS-aware
      // equivalent below. Turn it off and use @typescript-eslint/no-unused-vars.
      'no-unused-vars': 'off',

      // TypeScript supports value+type declaration merging (e.g. exporting both
      // `export const Foo = FooSchema` and `export type Foo = z.infer<...>` with
      // the same name). The base no-redeclare doesn't understand this.
      'no-redeclare': 'off',

      // ── TypeScript-aware rules ────────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Non-null assertions (!) are used deliberately throughout the route layer:
      // req.tenantId!, req.user! etc. are guaranteed non-null after auth middleware
      // runs, and the TypeScript compiler (tsc --noEmit, enforced in CI) already
      // provides null-safety analysis. Flagging every assertion as a warning adds
      // noise without catching real bugs in this codebase pattern.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // ── Security rules — flag common security anti-patterns ───────────────
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'warn',
      // detect-object-injection produces far too many false positives with
      // normal bracket-notation property access (e.g. `obj[key]`) in TypeScript.
      // Turned off project-wide; manually audit bracket-access on untrusted input.
      'security/detect-object-injection': 'off',
      // detect-non-literal-fs-filename fires on every fs call whose path comes
      // from a variable. In this codebase ALL file paths come from:
      //   (a) build-time environment config  (b) admin-controlled policy files
      //   (c) the SDK's own local cache directory
      // None of these are ever derived from unsanitised user/network input, so
      // the rule produces 100% false positives here. Real path-traversal risks
      // are guarded at the HTTP layer. Turned off project-wide; re-enable
      // per-file if a new call site takes paths from request data.
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',

      // ── General hygiene ───────────────────────────────────────────────────
      'no-console': 'off',    // We use pino, but console.* still useful in scripts
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'warn',
    },
  },
];
