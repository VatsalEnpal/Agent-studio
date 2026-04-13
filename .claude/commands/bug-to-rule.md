---
name: bug-to-rule
description: Turn a bug into an automated prevention rule (Frank Neff pattern)
---

# Bug → Rule

When a bug is found, don't just fix it — create an automated rule that prevents it from happening again.

## Steps

1. **Identify the bug**: What broke? What was the root cause?

2. **Fix the bug**: Write the minimal fix.

3. **Write a test**: Create a test (vitest or playwright) that would have caught this bug. The test should:
   - Be named after the behavior it guards (e.g., "should cap room messages at 200")
   - Fail when the bug is reintroduced
   - Run fast in isolation

4. **Check if a lint rule could catch it**: Could ESLint, TypeScript strict flags, or a custom rule prevent this class of bug? If yes, add the rule.

5. **Update CURRENT_STATE.md**: Record what was broken, what was fixed, and what rule was added.

6. **Update CLAUDE.md if needed**: If this is a new "Known Fragile Area" or a new pattern to follow, add it.

The goal: every bug we fix makes the codebase permanently stronger. Over time, the automated rules accumulate like an immune system.
