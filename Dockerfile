FROM node:22-slim

# node-pty needs build tools
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 8080
CMD ["npm", "run", "dev"]
