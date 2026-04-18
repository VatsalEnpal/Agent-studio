FROM node:22-slim

# Build tools for node-pty + git for repo operations + curl for health checks + tini for PID 1
RUN apt-get update && apt-get install -y python3 make g++ git curl tini && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Port for Agent Studio
EXPOSE 8080

# Bind to all interfaces inside the container so `docker run -p` forwards work
ENV HOST=0.0.0.0

# Persist user's Claude agents across container restarts
VOLUME ["/root/.claude/agents"]

# tini as PID 1 so signals propagate correctly to node-pty children
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command
CMD ["npm", "run", "dev"]
