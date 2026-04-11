# Resume the "Agent Studio Deep Research" Session

## Quick resume
```bash
claude --resume 520c2945 -n "Agent Studio Deep Research"
```
(You only need the first 8 chars of the ID — Claude matches the prefix)

## Or interactive picker
```bash
claude --resume
```
Look for the session from April 11 with "agent studio" / "stability" in the first message.

## If resume fails after plan switch
```bash
cd ~/Code/AgentStudio
claude -n "Agent Studio Stabilization"
# Then say: "Read KNOWLEDGE_BASE.md — continue from the April 11 session"
```
