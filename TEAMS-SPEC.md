# Agent Studio — Teams View Spec (v2)

## Core Concept: Workflow Player

Teams mode is NOT a dashboard. It is a workflow execution viewer — like a CI/CD pipeline UI.

### Structure

Left sidebar: list of Flows (Sprint Planning, Clearing Creation, etc.) with their Runs underneath.
Main content: vertical step timeline for the selected run.
Each step: toggleable, shows agents, duration, logs, actions.
Current step highlighted. User actions pulse amber.

### Step States

- completed: green checkmark
- active: yellow spinner (in progress)
- waiting: amber pulse (needs YOUR action)
- pending: gray circle (not started)
- failed: red X

### User Actions (from UI, no terminal)

- Go: triggers sprint start
- Approve: confirms spec
- Provide OTP: input field for QA login
- View Spec/Logs/Diff: expand toggles
- Retry: re-run failed step

### System Panel (sidebar, always visible)

- Tokens used / remaining
- Cost today
- Context % of focused session
- PMO status + last scan
- Memory count
- Session count
- Scheduler on/off toggle

### Data Sources

- scan_log.md → PMO scan data
- current.md → current sprint spec
- ready.md → what PMO found
- archive/*.md → past runs
- handoffs/*.json → agent handoffs
- memory_index.json → memory stats
