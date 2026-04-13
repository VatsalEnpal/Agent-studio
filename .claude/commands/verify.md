---
name: verify
description: Run full verification suite (typecheck + lint + build + tests)
---

# Full Verification

Run the complete quality gate suite and report results.

## Run these in order:

1. `npm run type-check` — TypeScript errors
2. `npx eslint src/ server/ --ext .ts,.tsx 2>&1 | tail -20` — Lint errors (if ESLint configured)
3. `npx vitest run --reporter=verbose 2>&1 | tail -30` — Unit tests
4. `npm run build 2>&1 | tail -20` — Build check
5. If dev server running: use Playwright MCP to navigate to http://localhost:8080, take a snapshot, and verify the UI renders correctly

## Report format:
- PASS / FAIL for each gate
- Error details for any failures
- Screenshot if UI verification was done
