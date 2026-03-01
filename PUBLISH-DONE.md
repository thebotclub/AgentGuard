# Publish Summary — AgentGuard SDK

**Date:** 2026-03-01  
**Status:** ✅ Packages built and ready — ⚠️ Credentials required for final publish step

---

## Part 1: npm package — `@agentguard/sdk`

### What was done

- ✅ Added `packages/sdk/src/sdk/client.ts` — `AgentGuard` HTTP client class with methods:
  - `evaluate(action)` — evaluate a tool call against the hosted API
  - `getUsage()` — fetch usage statistics
  - `getAudit(options?)` — retrieve audit trail events
  - `killSwitch(active)` — activate/deactivate global kill switch
- ✅ Exported `AgentGuard` from `packages/sdk/src/sdk/index.ts`
- ✅ Added `files: ["dist", "README.md"]` to `package.json` (ensures compiled output is published)
- ✅ Removed `@agentguard/shared: "*"` workspace dependency (would break for external npm consumers)
- ✅ Added comprehensive `packages/sdk/README.md` with installation, quick starts, and full API reference
- ✅ TypeScript build: `npx tsc --build` — **succeeded with no errors**
- ✅ Dry-run: `npm publish --access public --dry-run` — **succeeded** (46 files, 56.6 kB)
- ✅ Local test: `node -e "import('./dist/sdk/client.js').then(m => console.log(m.AgentGuard))"` — **OK**

### To publish

No npm auth token found (`~/.npmrc` has no `_authToken`). To publish:

```bash
# Option A: set NPM_TOKEN env var and publish
NPM_TOKEN=npm_xxxx npm publish --access public

# Option B: add token to ~/.npmrc
echo "//registry.npmjs.org/:_authToken=npm_xxxx" >> ~/.npmrc
cd packages/sdk && npm publish --access public

# Option C: interactive login
cd packages/sdk && npm login && npm publish --access public
```

---

## Part 2: Python package — `agentguard`

### What was created

New directory: `packages/python/`

```
packages/python/
  agentguard/
    __init__.py       — exports AgentGuard, sets __version__ = "0.1.0"
    client.py         — AgentGuard HTTP client (zero external dependencies)
  pyproject.toml      — build config, metadata, PyPI classifiers
  README.md           — installation, quick start, full API reference
  LICENSE             — MIT
  dist/
    agentguard-0.1.0-py3-none-any.whl   ✅ built
    agentguard-0.1.0.tar.gz             ✅ built
```

### Client methods

| Method | Description |
|---|---|
| `evaluate(tool, params)` | Evaluate agent action against policy |
| `get_usage()` | Get usage stats for tenant |
| `get_audit(limit, offset)` | Get audit trail events |
| `kill_switch(active)` | Activate/deactivate global kill switch |
| `verify_audit()` | Verify hash chain integrity |

### Build results

- ✅ `python3 -c "from agentguard import AgentGuard; print('OK')"` — **OK**
- ✅ `python3 -m build` — **succeeded** (both wheel and sdist)
- ✅ `twine check dist/*` — **PASSED** for both artifacts

### To publish

No PyPI credentials found (no `~/.pypirc`, no `TWINE_PASSWORD` env var). To publish:

```bash
# Option A: use API token (recommended)
cd packages/python
TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-xxxx PATH="$PATH:/home/vector/.local/bin" twine upload dist/*

# Option B: create ~/.pypirc
cat > ~/.pypirc << EOF
[pypi]
  username = __token__
  password = pypi-xxxx
EOF
cd packages/python && twine upload dist/*
```

---

## Notes

- The Python `pyproject.toml` originally used `setuptools.backends._legacy:_Backend` as the build backend, which doesn't exist in setuptools 82. Fixed to `setuptools.build_meta`.
- Both packages use zero external dependencies beyond their language's stdlib (Python) / native Node fetch (npm).
- TypeScript target: ES2022, module: ESNext, Node 18+.
