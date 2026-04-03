/**
 * Zod schemas for Agent Studio configuration validation.
 *
 * Used to validate and apply defaults when loading `.agent-studio.json`.
 * Each schema mirrors the corresponding interface in `shared/types.ts`.
 *
 * @module server/config-schema
 */

import { z } from "zod";

/** Schema for a tracked project. */
export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  isProd: z.boolean().default(false),
  trackedBranches: z.array(z.string()).optional(),
});

/** Schema for a development server entry. */
export const DevServerConfigSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  command: z.string().min(1),
  port: z.number().int().positive().optional(),
});

/** Schema for the optional agent system configuration. */
export const AgentSystemSchema = z.object({
  path: z.string().min(1),
  memoryIndex: z.string().default("tools/memory_index.json"),
  sprintDir: z.string().default("sprints/"),
  scanLog: z.string().optional(),
});

/** Schema for user-facing defaults. */
export const DefaultsSchema = z.object({
  model: z.string().default("sonnet"),
  permissions: z.string().default("default"),
  workingDirectory: z.string().default(""),
});

/** Top-level schema for the entire `.agent-studio.json` config file. */
export const AgentStudioConfigSchema = z.object({
  projects: z.array(ProjectConfigSchema).default([]),
  agentSystem: AgentSystemSchema.optional(),
  devServers: z.array(DevServerConfigSchema).default([]),
  defaults: DefaultsSchema.default({
    model: "sonnet",
    permissions: "default",
    workingDirectory: "",
  }),
  setupComplete: z.boolean().default(false),
  version: z.string().default("1.0.0"),
});

/** The validated and defaulted config type inferred from the Zod schema. */
export type ValidatedConfig = z.infer<typeof AgentStudioConfigSchema>;

/**
 * Validate and apply defaults to a raw config object.
 * Throws a ZodError if the input is fundamentally invalid (wrong types, etc.).
 * Missing optional fields are filled with sensible defaults.
 *
 * @param raw - The parsed JSON object from disk
 * @returns A fully validated config with all defaults applied
 */
export function validateConfig(raw: unknown): ValidatedConfig {
  return AgentStudioConfigSchema.parse(raw);
}

/**
 * Attempt to validate, returning null on failure instead of throwing.
 * Useful when you want to fall back to generating a fresh config.
 *
 * @param raw - The parsed JSON object from disk
 * @returns The validated config, or null if validation failed
 */
export function safeValidateConfig(
  raw: unknown,
): { success: true; data: ValidatedConfig } | { success: false; error: z.ZodError } {
  const result = AgentStudioConfigSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
