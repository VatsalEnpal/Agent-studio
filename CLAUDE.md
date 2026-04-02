# agent-studio — Claude Code Instructions

## Project Overview

Web-based command center for AI coding agents. Manage Claude Code sessions, custom agents, and automated workflows from one dashboard.

- **Languages**: TypeScript
- **Frameworks**: Next.js, React, Express, Tailwind CSS
- **Package Manager**: npm
- **Tests**: Configured
- **CI/CD**: Not configured
- **Docker**: Yes

## Agent System

This project uses a multi-agent architecture managed by Agent Studio.
Agents are defined in `.claude/agents/`.

### Available Agents

| Agent | Description | Model |
|-------|-------------|-------|
| **backend** | Agent from agent-studio | sonnet |
| **documentation** | Agent from agent-studio | sonnet |
| **domain** | Agent from agent-studio | sonnet |
| **frontend** | Agent from agent-studio | sonnet |
| **orchestrator** | Agent from agent-studio | sonnet |
| **pmo** | Agent from agent-studio | sonnet |
| **qa** | Agent from agent-studio | sonnet |
| **security** | Agent from agent-studio | sonnet |

## Core Rules

- Follow the reasoning protocol in each agent's .md file
- Never commit secrets, API keys, or credentials
- Run the type checker before committing (`npx tsc --noEmit` or equivalent)
- All agents report completion to the orchestrator
- Test changes before marking tasks complete

## Memory Protocol

After completing any significant task, write a memory file:

| What happened | Folder |
|---------------|--------|
| Discovered a pattern | `ai-agents/memory/learnings/` |
| Fixed a bug | `ai-agents/memory/corrections/` |
| Made a decision | `ai-agents/memory/decisions/` |

File format: `YYYYMMDD_HHMMSS_{agent}_{type}.json`

## Code Style

- **TypeScript**: Configured (`tsconfig.json`, strict mode enabled)

## Project Structure

```
ai-agents/
public/
qa-screenshots/
qa-screenshots-v2/
server/
src/
```
