FROM node:22-slim

# Build tools for node-pty + git for repo operations + curl for health checks
RUN apt-get update && apt-get install -y python3 make g++ git curl && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Port for Agent Studio
EXPOSE 8080

# Default command
CMD ["npm", "run", "dev"]
