// ---------- Smart Automation Suggestions ----------
//
// Given a project analysis (from the agent generator's analyzer),
// suggests which automations make sense for this specific project.

import {
  AUTOMATION_TEMPLATES,
  fillPromptTemplate,
  type AutomationTemplate,
} from "./automation-templates.js";
import type { ProjectAnalysis } from "./agent-generator.js";

// ---------- Types ----------

export interface AutomationSuggestion {
  template: AutomationTemplate;
  reason: string;
  customizedPrompt: string;
  priority: "recommended" | "optional";
}

// ---------- Language/framework normalization ----------

/** Maps ProjectAnalysis values to template applicableTo tags */
function normalizeStack(analysis: ProjectAnalysis): string[] {
  const tags = new Set<string>();

  for (const lang of analysis.languages) {
    const lower = lang.toLowerCase();
    if (lower.includes("typescript") || lower.includes("javascript")) {
      tags.add("node");
    }
    if (lower.includes("python")) tags.add("python");
    if (lower.includes("rust")) tags.add("rust");
    if (lower.includes("go")) tags.add("go");
    if (lower.includes("java") && !lower.includes("javascript")) tags.add("java");
    if (lower.includes("ruby")) tags.add("ruby");
  }

  for (const fw of analysis.frameworks) {
    const lower = fw.toLowerCase();
    if (lower.includes("next") || lower.includes("react") || lower.includes("express") || lower.includes("node")) {
      tags.add("node");
    }
    if (lower.includes("django") || lower.includes("flask") || lower.includes("fastapi")) {
      tags.add("python");
    }
  }

  return Array.from(tags);
}

// ---------- Reason generation ----------

function getReasonForProject(
  template: AutomationTemplate,
  analysis: ProjectAnalysis,
  stackTags: string[],
): string {
  switch (template.id) {
    case "code-health": {
      const checks: string[] = [];
      if (stackTags.includes("node")) checks.push("TypeScript type checking");
      if (analysis.hasTests) checks.push("test runner detected");
      if (stackTags.includes("node")) checks.push("npm audit");
      if (stackTags.includes("python")) checks.push("pip-audit");
      return checks.length > 0
        ? `Your project supports: ${checks.join(", ")}`
        : "Recommended for all projects — catches common issues early";
    }
    case "pr-reviewer":
      return "Automated PR reviews catch bugs before they reach main";
    case "security-scan":
      return "Recommended for all projects — finds vulnerabilities and leaked secrets";
    case "dependency-update": {
      const mgr = analysis.packageManager || "detected package manager";
      return `Uses ${mgr} — outdated dependencies are a common security risk`;
    }
    case "test-coverage":
      return analysis.hasTests
        ? "Tests detected — coverage analysis will find untested critical paths"
        : "No tests detected yet — coverage analyzer will identify where to start";
    case "documentation":
      return "Keeps README and docs in sync with code changes";
    default:
      return "Suggested based on your project structure";
  }
}

// ---------- Framework-specific prompt additions ----------

function getFrameworkAdditions(
  templateId: string,
  analysis: ProjectAnalysis,
): string {
  const additions: string[] = [];
  const frameworks = analysis.frameworks.map((f) => f.toLowerCase());

  if (templateId === "code-health") {
    if (frameworks.some((f) => f.includes("next"))) {
      additions.push("Note: This is a Next.js project. Also check for: unused pages, broken API routes, middleware issues.");
    }
    if (frameworks.some((f) => f.includes("express"))) {
      additions.push("Note: This is an Express project. Check for: unhandled async errors, missing error middleware.");
    }
    if (frameworks.some((f) => f.includes("django"))) {
      additions.push("Note: This is a Django project. Also run: `python manage.py check --deploy` for deployment readiness.");
    }
  }

  if (templateId === "security-scan") {
    if (frameworks.some((f) => f.includes("next") || f.includes("react"))) {
      additions.push("Note: React/Next.js project. Pay special attention to dangerouslySetInnerHTML usage and CSRF protection.");
    }
    if (frameworks.some((f) => f.includes("express"))) {
      additions.push("Note: Express project. Check for: helmet middleware, CORS configuration, rate limiting.");
    }
  }

  if (templateId === "test-coverage") {
    if (frameworks.some((f) => f.includes("next"))) {
      additions.push("Note: Next.js project. Check coverage of: API routes (app/api/), middleware, server components.");
    }
  }

  return additions.length > 0 ? "\n\n" + additions.join("\n") : "";
}

// ---------- Main suggestion function ----------

/**
 * Suggest automations for a project based on its analysis.
 * Returns suggestions sorted by priority (recommended first).
 */
export function suggestAutomations(
  analysis: ProjectAnalysis,
  projectPath: string,
): AutomationSuggestion[] {
  const stackTags = normalizeStack(analysis);
  const suggestions: AutomationSuggestion[] = [];

  for (const template of AUTOMATION_TEMPLATES) {
    // Check if template applies to this project
    const applies =
      template.applicableTo.includes("any") ||
      template.applicableTo.some((t) => stackTags.includes(t));

    if (!applies) continue;

    // Customize the prompt with project-specific data
    let prompt = fillPromptTemplate(template.promptTemplate, {
      projectPath,
    });

    // Add framework-specific instructions
    prompt += getFrameworkAdditions(template.id, analysis);

    // Determine priority
    const isRecommended =
      template.id === "code-health" ||
      template.id === "security-scan" ||
      (template.id === "test-coverage" && analysis.hasTests);

    suggestions.push({
      template,
      reason: getReasonForProject(template, analysis, stackTags),
      customizedPrompt: prompt,
      priority: isRecommended ? "recommended" : "optional",
    });
  }

  // Sort: recommended first, then alphabetical
  suggestions.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === "recommended" ? -1 : 1;
    }
    return a.template.name.localeCompare(b.template.name);
  });

  return suggestions;
}
