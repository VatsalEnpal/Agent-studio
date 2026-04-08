---
name: visual-qa
description: Visual QA testing from a real user's perspective. Takes screenshots at every step, reads and analyzes each one, catches UX issues that code-level testing misses. Use after ANY UI change, before telling the user something is fixed, and before building the Mac app. MANDATORY before any "it's fixed" claim.
---

# Visual QA — Test Like A Real User

You are a QA tester who has never seen this app before. You don't know the code. You only know what's on screen. Your job is to find every problem a real user would notice.

## WHEN TO USE THIS SKILL

- After ANY UI change (component edit, styling fix, layout change)
- Before telling the user "it's fixed"
- Before building the Mac app
- When the user reports a bug — reproduce it FIRST, then fix, then verify with this skill

## THE RULE

**Never say "fixed" without a screenshot proving it.** If you can't show a screenshot where the fix is visible, it's not fixed.

## PROCESS

```
1. Start dev server (npm run dev) if not running
2. For each feature/fix being tested:
   a. Take a screenshot BEFORE interacting
   b. Perform the user action (click, type, navigate)
   c. Take a screenshot AFTER the action
   d. READ the screenshot with the Read tool
   e. Analyze it AS A USER — not as a developer
   f. Write down what you see (good and bad)
   g. If something looks wrong, STOP and fix it before continuing
3. Compile a verdict: PASS or FAIL with evidence
```

## HOW TO TAKE AND ANALYZE SCREENSHOTS

```javascript
// Use Playwright with VISIBLE browser mode for accuracy
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000); // Let everything render

// Screenshot
await page.screenshot({ path: '/tmp/qa-step-N.png' });
```

After EVERY screenshot, use the Read tool to view it:
```
Read({ file_path: '/tmp/qa-step-N.png' })
```

Then analyze what you see. Ask yourself:
- Can I read all the text? Is anything too light or too small?
- Does the layout make sense? Is anything cut off or overlapping?
- Are interactive elements visible and clickable?
- Does this look like a polished app or a broken prototype?
- Would the user understand what they're looking at?

## WHAT TO CHECK — PER VIEW

### Sessions View
- [ ] "RUNNING" section header readable
- [ ] Session names visible and meaningful (not "You are..." garbage)
- [ ] History tab shows past sessions with useful names and timestamps
- [ ] Search input works
- [ ] "New Session" button visible
- [ ] Dev Servers section visible

### Teams / Rooms View
- [ ] Room list shows active rooms
- [ ] No intro messages from agents on room creation (only system message)
- [ ] User message appears in right-aligned bubble
- [ ] Agent responses appear with avatar + name + readable text
- [ ] Markdown renders correctly (tables, bold, headers, lists)
- [ ] @mentions highlighted in blue
- [ ] "Waiting for your input" banner shows when agents tag @user
- [ ] Messages are reasonably short (not 5000-char walls)

### Sprint View
- [ ] Vertical gate list (NO horizontal stepper)
- [ ] Gates show status dots (green=passed, orange=in progress, gray=pending)
- [ ] Clicking a gate expands details BELOW it
- [ ] "Approve Sprint" button visible on actionable gates
- [ ] Pause/Resume buttons in header
- [ ] Agents in footer (single line, not a section)
- [ ] "View activity logs" link at bottom

### Settings View
- [ ] Model selector pills visible and tappable
- [ ] No personal paths visible (for GitHub screenshots)
- [ ] Notifications toggles work
- [ ] Shortcuts table readable

### Knowledge/Memory View
- [ ] Filter pills visible
- [ ] Memory entries load
- [ ] Search works

## TESTING AGENT ROOMS — THE HARD PART

Room testing requires REAL agent interactions. Don't test with `curl` — test through the UI or at minimum via API + screenshot verification.

### Room Test Protocol:
1. Create room via API with agents (use `sonnet` model — same as user):
```bash
curl -s -X POST http://localhost:8080/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Test","topic":"Testing","agents":[
    {"id":"orchestrator","name":"Orchestrator","model":"sonnet"},
    {"id":"pmo","name":"PMO","model":"sonnet"}
  ]}'
```

2. Spawn agents (dormant):
```bash
curl -s -X POST http://localhost:8080/api/rooms/<id>/spawn
```

3. Verify NO intro messages — only 2 system messages:
```bash
curl -s http://localhost:8080/api/rooms/<id> | python3 -c "
import sys, json
msgs = json.load(sys.stdin)['messages']
agent_msgs = [m for m in msgs if m['from'] not in ('system','user')]
assert len(agent_msgs) == 0, f'FAIL: {len(agent_msgs)} agent intros found'
print('PASS: No intro messages')
"
```

4. Send a message and wait for response:
```bash
curl -s -X POST http://localhost:8080/api/rooms/<id>/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"user","text":"@pmo hello, say one line and tag @orchestrator"}'

sleep 30  # Sonnet takes time

curl -s http://localhost:8080/api/rooms/<id> | python3 -c "
import sys, json
msgs = json.load(sys.stdin)['messages']
agents = set(m['from'] for m in msgs if m['from'] not in ('system','user'))
assert 'pmo' in agents, 'FAIL: PMO did not respond'
print(f'PASS: Agents responded: {agents}')
# Check if chain worked
if 'orchestrator' in agents:
    print('PASS: Chain worked — orchestrator auto-responded')
else:
    print('WARN: Orchestrator did not respond (chain may be slow)')
"
```

5. Take screenshot of the room in browser and READ it:
```javascript
await page.click('button[aria-label="Teams"]');
await page.waitForTimeout(2000);
// Click the test room
await page.locator('text=QA Test').first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/qa-room-test.png' });
```

6. Analyze the screenshot:
- Are messages short and readable?
- Did the agent use @mentions in its response?
- Is there a "typing..." indicator or "waiting for input" banner?
- Does it look like Slack or like a terminal dump?

## CRITICAL: MODEL MATTERS

**Always test with `sonnet` model for rooms.** Haiku is fast and brief — it makes everything look good. Sonnet is what the user actually uses, and it's more verbose. If you test with haiku and declare "fixed," you're lying.

## CRITICAL: DEV SERVER vs MAC APP

The dev server (`npm run dev`) and Mac app are DIFFERENT:
- Dev server: hot reload, uses tsx, reads config from project cwd
- Mac app: production build, uses compiled JS, reads config from ~/.agent-studio/

**Test on dev server first.** Only build the Mac app when ALL dev server tests pass. Never rebuild the Mac app to "test a fix" — that's a 5-minute build for something you can test in 5 seconds on dev.

## CRITICAL: NEVER SAY "FIXED" IF

- You only changed code but didn't take a screenshot
- You tested with curl/API but didn't look at the UI
- You tested with haiku but the user uses sonnet
- You tested one scenario but the user's scenario is different
- The screenshot shows something different from what the user reported

## REPORT FORMAT

After testing, report:

```
## Visual QA Report

### Tested on: [dev server / mac app]
### Model used: [haiku / sonnet]

| Check | Status | Screenshot |
|-------|--------|------------|
| Sessions readable | PASS/FAIL | /tmp/qa-step-1.png |
| History shows names | PASS/FAIL | /tmp/qa-step-2.png |
| Room no intros | PASS/FAIL | /tmp/qa-step-3.png |
| Room chain works | PASS/FAIL | /tmp/qa-step-4.png |
| Sprint vertical | PASS/FAIL | /tmp/qa-step-5.png |
| Settings clean | PASS/FAIL | /tmp/qa-step-6.png |

### Issues found:
1. [description + screenshot path]

### Verdict: PASS / FAIL
```

Only report PASS if you have screenshot evidence. Only report FAIL if you can show the problem.
