// ---------- Automation Template System ----------
//
// Each template defines a reusable automation config with a smart Claude prompt.
// Templates know what stack they apply to and how to parse their output.

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  applicableTo: string[];        // frameworks/languages: ["node", "python", "any"]
  defaultSchedule: string;
  defaultModel: "opus" | "sonnet" | "haiku";
  promptTemplate: string;        // with {{placeholders}} for project-specific data
  outputParser: "json" | "markdown" | "checklist";
  suggestedActions?: Array<{
    condition: string;            // regex to match in output
    title: string;
    agent: string;
    promptTemplate: string;
  }>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "code-health",
    name: "Code Health Scan",
    description: "Runs type checking, tests, and security audit. Reports failures with fix suggestions.",
    icon: "HeartPulse",
    applicableTo: ["any"],
    defaultSchedule: "every 2h",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Analyze the project at {{projectPath}} for code health.

Run each check and report results. If a check is not applicable (e.g., no test runner configured), note it as "skipped".

1. **Type checker**
   - TypeScript: \`npx tsc --noEmit\`
   - Python: \`mypy . --ignore-missing-imports\` or \`pyright .\`
   - Go: \`go vet ./...\`
   - If no type system: skip

2. **Tests**
   - Detect the test runner from package.json scripts, setup.cfg, pyproject.toml, or Cargo.toml
   - Run it with a timeout of 60 seconds
   - If no test runner found: skip

3. **Security audit**
   - Node: \`npm audit --json\`
   - Python: \`pip-audit\` or \`safety check\`
   - Rust: \`cargo audit\`
   - If no package manager: skip

4. **Code quality**
   - Check for TODO/FIXME/HACK comments in source files (skip node_modules, .git, dist, build)
   - Count them and list the top 10

Output a JSON object (no markdown fences around it):
{
  "typeCheck": {"pass": true, "errors": 0, "details": "..."},
  "tests": {"pass": true, "total": 0, "failed": 0, "skipped": false, "details": "..."},
  "security": {"vulnerabilities": 0, "critical": 0, "details": "..."},
  "todos": [{"file": "...", "line": 1, "text": "..."}],
  "summary": "One paragraph overall health assessment",
  "score": 85
}

Score guide: 100 = all checks pass, no todos. Subtract 5 per type error, 10 per test failure, 15 per critical vulnerability, 1 per todo.`,
    suggestedActions: [
      {
        condition: "type.*error|typeCheck.*false",
        title: "Fix type errors",
        agent: "backend",
        promptTemplate: "Fix all TypeScript/type errors in {{projectPath}}. Run `npx tsc --noEmit` and fix each error.",
      },
      {
        condition: "test.*fail|tests.*false",
        title: "Fix failing tests",
        agent: "qa",
        promptTemplate: "Fix failing tests in {{projectPath}}. Run the test suite, identify failures, and fix them.",
      },
      {
        condition: "critical.*[1-9]|vulnerabilit.*[1-9]",
        title: "Fix security vulnerabilities",
        agent: "security",
        promptTemplate: "Fix critical security vulnerabilities in {{projectPath}}. Run `npm audit fix` or equivalent, then manually fix remaining issues.",
      },
    ],
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description: "Reviews open pull requests for bugs, style issues, and missing tests.",
    icon: "GitPullRequest",
    applicableTo: ["any"],
    defaultSchedule: "every 6h",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Review open pull requests in the repo at {{projectPath}}.

Use \`gh pr list --json number,title,author,url,additions,deletions,files --limit 10\` to find open PRs.

For each open PR:
1. Read the diff: \`gh pr diff <number>\`
2. Check for:
   - Bugs: null pointer risks, off-by-one errors, race conditions, unhandled errors
   - Security: SQL injection, XSS, hardcoded secrets, insecure dependencies
   - Style: inconsistent naming, dead code, overly complex functions (>50 lines)
   - Missing tests: new code paths without corresponding test coverage
   - API contract: breaking changes to public interfaces
3. Be constructive — suggest specific improvements, not vague complaints

Output JSON (no markdown fences):
{
  "prs": [
    {
      "number": 123,
      "title": "...",
      "author": "...",
      "url": "...",
      "issues": [
        {"severity": "high", "category": "bug|security|style|tests", "description": "...", "file": "...", "line": 0, "suggestion": "..."}
      ],
      "verdict": "approve|request-changes|comment",
      "summary": "One sentence summary of the PR quality"
    }
  ],
  "summary": "Overall summary across all PRs"
}

If \`gh\` is not installed or no PRs are open, say so in the summary and return an empty prs array.`,
    suggestedActions: [
      {
        condition: "request-changes",
        title: "Address PR review comments",
        agent: "backend",
        promptTemplate: "Address the review comments on PR #{{prNumber}} in {{projectPath}}.",
      },
    ],
  },
  {
    id: "security-scan",
    name: "Security Scanner",
    description: "Checks dependencies for vulnerabilities and scans code for hardcoded secrets.",
    icon: "Shield",
    applicableTo: ["any"],
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Perform a thorough security scan on {{projectPath}}.

1. **Dependency vulnerabilities**
   - Node: \`npm audit --json\` — parse the JSON output for severity counts
   - Python: \`pip-audit\` or \`safety check --json\`
   - If no package manager detected: skip

2. **Hardcoded secrets scan**
   - Search source files (not node_modules, .git, dist, build, coverage) for patterns:
     - API keys: strings matching /[A-Za-z0-9_-]{20,}/ near keywords like "api_key", "apikey", "secret", "token"
     - AWS keys: /AKIA[0-9A-Z]{16}/
     - Private keys: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/
     - Connection strings: /mongodb\+srv:\/\/|postgres:\/\/|mysql:\/\// with credentials
   - Show file, line number, and a redacted preview (first 8 chars + "...")

3. **Security anti-patterns**
   - eval() usage with dynamic input
   - SQL string concatenation (instead of parameterized queries)
   - innerHTML assignment with user input
   - Disabled CSRF protection
   - HTTP instead of HTTPS in API URLs

4. **Gitignore review**
   - Check if .env, .env.local, .env.production, credentials.json, *.pem are in .gitignore
   - Check if they exist in the repo (accidental commits)

Output JSON (no markdown fences):
{
  "dependencies": {"vulnerabilities": 0, "critical": [], "high": [], "moderate": []},
  "secrets": [{"file": "...", "line": 0, "type": "api_key|password|token|aws_key|private_key", "preview": "AKIA1234..."}],
  "antiPatterns": [{"file": "...", "line": 0, "pattern": "eval|sql-concat|innerHTML", "severity": "high|medium|low", "fix": "..."}],
  "gitignore": {"missing": [], "committed": []},
  "score": 90,
  "summary": "Overall security posture assessment"
}`,
    suggestedActions: [
      {
        condition: "secret|AKIA|private.key|password",
        title: "Remove hardcoded secrets",
        agent: "security",
        promptTemplate: "Remove hardcoded secrets from {{projectPath}}. Move them to environment variables and update .gitignore.",
      },
      {
        condition: "critical.*[1-9]",
        title: "Fix critical vulnerabilities",
        agent: "security",
        promptTemplate: "Fix critical dependency vulnerabilities in {{projectPath}}. Run the package manager's audit fix command.",
      },
    ],
  },
  {
    id: "dependency-update",
    name: "Dependency Updater",
    description: "Checks for outdated packages and suggests safe update paths.",
    icon: "Package",
    applicableTo: ["node", "python", "rust"],
    defaultSchedule: "weekly",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Check {{projectPath}} for outdated dependencies.

1. **List outdated packages**
   - Node: \`npm outdated --json\`
   - Python: \`pip list --outdated --format=json\`
   - Rust: \`cargo outdated --format json\` (if installed)

2. **Classify each update**
   - Patch (x.y.Z): safe to auto-update
   - Minor (x.Y.0): usually safe, check changelog
   - Major (X.0.0): likely breaking changes — flag prominently

3. **Check for security relevance**
   - Cross-reference with known vulnerability databases
   - Mark packages that have security advisories

4. **Suggest update order**
   - Start with security-relevant patches
   - Then safe patches
   - Then minor updates
   - Major updates last (one at a time, with testing)

Output JSON (no markdown fences):
{
  "outdated": [
    {"name": "...", "current": "1.0.0", "latest": "2.0.0", "type": "major|minor|patch", "breaking": false, "securityRelevant": false}
  ],
  "suggestedOrder": ["pkg-security-fix", "pkg-patch", "pkg-minor"],
  "stats": {"total": 0, "major": 0, "minor": 0, "patch": 0, "securityRelevant": 0},
  "summary": "One paragraph dependency health assessment"
}`,
    suggestedActions: [
      {
        condition: "securityRelevant.*true",
        title: "Apply security updates",
        agent: "backend",
        promptTemplate: "Update security-relevant packages in {{projectPath}}: {{packages}}. Run tests after each update.",
      },
    ],
  },
  {
    id: "test-coverage",
    name: "Test Coverage Analyzer",
    description: "Identifies untested code paths and suggests specific test cases.",
    icon: "TestTube",
    applicableTo: ["node", "python"],
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Analyze test coverage for {{projectPath}}.

1. **Run coverage report** (if possible)
   - Node/Jest: \`npx jest --coverage --json 2>/dev/null\` or check for existing coverage/ directory
   - Node/Vitest: \`npx vitest run --coverage --reporter=json 2>/dev/null\`
   - Python: \`python -m pytest --cov --cov-report=json 2>/dev/null\`
   - If coverage tools aren't configured, analyze file-by-file

2. **Identify files with no tests**
   - Find source files that have no corresponding test file
   - Convention: src/foo.ts -> tests/foo.test.ts, src/foo.py -> tests/test_foo.py

3. **Identify critical untested paths**
   - Authentication/authorization code
   - Payment/billing logic
   - Data mutation endpoints (POST/PUT/DELETE handlers)
   - Error handling paths
   - Input validation

4. **Suggest specific test cases**
   - For each critical gap, write 2-3 concrete test case descriptions
   - Include edge cases: empty input, null values, unauthorized access, concurrent requests

Output JSON (no markdown fences):
{
  "coverage": {"percentage": 0, "files": {"tested": 0, "untested": 0, "total": 0}},
  "untestedFiles": [{"file": "...", "reason": "No corresponding test file", "priority": "high|medium|low"}],
  "criticalGaps": [
    {"file": "...", "function": "...", "reason": "Auth logic without tests", "suggestedTests": ["Test login with valid credentials", "Test login with expired token"]}
  ],
  "summary": "Overall test coverage assessment with actionable recommendations"
}`,
    suggestedActions: [
      {
        condition: "criticalGaps.*auth|criticalGaps.*payment",
        title: "Write critical path tests",
        agent: "qa",
        promptTemplate: "Write tests for critical untested code paths in {{projectPath}}: {{gaps}}.",
      },
    ],
  },
  {
    id: "documentation",
    name: "Documentation Checker",
    description: "Reviews README, API docs, and inline comments for completeness.",
    icon: "BookOpen",
    applicableTo: ["any"],
    defaultSchedule: "weekly",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Review documentation quality for {{projectPath}}.

1. **README analysis**
   - Check for: project description, installation steps, usage examples, API reference, contributing guide, license
   - Rate completeness as a percentage

2. **Inline documentation**
   - Sample 20 source files (prioritize main entry points, API handlers, utility functions)
   - Check for: JSDoc/docstrings on exported functions, comments on complex logic, type annotations
   - Rate as good (>70% documented), fair (40-70%), or poor (<40%)

3. **API documentation** (if applicable)
   - Check for OpenAPI/Swagger specs
   - Check if API routes have request/response documentation
   - List undocumented endpoints

4. **Outdated references**
   - Check README for references to files or functions that no longer exist
   - Check for broken relative links
   - Check for version numbers that don't match package.json

Output JSON (no markdown fences):
{
  "readme": {"exists": true, "completeness": 60, "sections": ["description", "install"], "missing": ["api", "contributing"]},
  "inlineDocs": {"coverage": "fair", "sampledFiles": 20, "documented": 12, "gaps": [{"file": "...", "function": "...", "type": "missing-jsdoc|missing-comment"}]},
  "apiDocs": {"hasSpec": false, "documented": 0, "undocumented": 0, "endpoints": []},
  "outdated": [{"file": "...", "issue": "References removed function foo()"}],
  "summary": "Overall documentation quality assessment"
}`,
  },
];

/**
 * Get a template by ID.
 */
export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}

/**
 * Fill in {{placeholders}} in a prompt template with actual values.
 */
export function fillPromptTemplate(
  template: string,
  values: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
