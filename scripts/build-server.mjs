#!/usr/bin/env node
/**
 * Pre-compile the server TypeScript to JavaScript for Electron packaging.
 * Uses esbuild to bundle server/index.ts → dist-server/index.js
 * with node_modules externalized (they're copied separately).
 */
import { build } from "esbuild";
import { rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Clean
rmSync(join(root, "dist-server"), { recursive: true, force: true });
mkdirSync(join(root, "dist-server"), { recursive: true });

await build({
  entryPoints: [join(root, "server", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: join(root, "dist-server", "index.js"),
  // Externalize native modules and heavy deps that don't bundle well
  external: [
    "node-pty",
    "chokidar",
    "next",
    "react",
    "react-dom",
    "@anthropic-ai/claude-agent-sdk",
    "tree-kill",
    "express",
    "ws",
    "zod",
  ],
  sourcemap: true,
  minify: false, // Keep readable for debugging
});

console.log("Server compiled to dist-server/index.js");
