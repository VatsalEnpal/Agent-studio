---
name: stabilize
description: Find and fix stability issues using systematic debugging
---

# Stabilize

Systematic approach to finding and fixing stability issues. Don't shotgun-fix — diagnose first.

## Phase 1: Investigate (do NOT fix yet)
1. Read CURRENT_STATE.md for known issues
2. Run `npm run type-check` — what type errors exist?
3. Run `npm run build` — what build errors exist?
4. Start dev server and use Playwright MCP to navigate through all 4 tabs (Sessions, Teams, Memory, Settings)
5. Check browser console for errors: `mcp__playwright__browser_console_messages`
6. Check network for failed requests: `mcp__playwright__browser_network_requests`

## Phase 2: Categorize
Sort issues by severity:
- **CRITICAL**: App crashes, data loss, security
- **HIGH**: Feature completely broken, no workaround
- **MEDIUM**: Feature partially broken, workaround exists
- **LOW**: Cosmetic, minor UX

## Phase 3: Fix (one at a time)
For each issue, starting with CRITICAL:
1. Write a failing test that reproduces the issue
2. Fix the issue with the minimum change needed
3. Run the test — confirm it passes
4. Run full verification (`/verify`)
5. Update CURRENT_STATE.md

## Phase 4: Harden
After fixing:
- Could a TypeScript strict flag have caught this? Add it.
- Could a lint rule have caught this? Add it.
- Update CLAUDE.md "Known Fragile Areas" if the area is still risky.
