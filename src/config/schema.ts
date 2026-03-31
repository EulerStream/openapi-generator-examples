import { z } from 'zod';

export const BoilerplateSchema = z.object({
  showTryCatch: z.boolean().default(false),
  showImports: z.boolean().default(true),
  showApiKeyConfig: z.boolean().default(false),
  showFullClass: z.boolean().default(false),
}).default({});

export const ParamOverridesSchema = z.object({
  /** Global overrides applied to all operations */
  global: z.record(z.string(), z.string()).default({}),
  /** Per-tag overrides (tag name → param name → value) */
  tags: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  /** Per-operation overrides (operationId → param name → value), highest priority */
  operations: z.record(z.string(), z.record(z.string(), z.string())).default({}),
}).default({});

export const ExamplesConfigSchema = z.object({
  /** Output directory for generated examples (default: ./usage relative to -o) */
  output: z.string().optional(),

  /** Boilerplate control flags */
  boilerplate: BoilerplateSchema,

  /**
   * Template variables available in mustache templates.
   * Well-known keys:
   *   sdkImport        - import statement(s) for the SDK
   *   clientConstruction - code to construct the client instance
   *   clientVar         - variable name for client (default: "client")
   *   apiKeyPlaceholder - placeholder for API key (default: "YOUR_API_KEY")
   *   apiAccessPattern  - "dot" (client.api.method) or "call" (client.api().method)
   */
  variables: z.record(z.string(), z.string()).default({}),

  /** Maps OpenAPI tags -> wrapper property names (e.g., "TikTok LIVE": "webcast") */
  apiClassMap: z.record(z.string(), z.string()).default({}),

  /** Path to a custom mustache template (overrides the built-in default for this language) */
  templatePath: z.string().optional(),

  /** Output formats: "md" (markdown), "json", or both. Default: ["md"] */
  outputFormats: z.array(z.enum(['md', 'json'])).default(['md']),

  /** Whether to include optional parameters in generated examples. Default: true */
  showOptionalParams: z.boolean().default(true),

  /**
   * Override example values for parameters and body properties.
   * Values are raw code strings used as-is (no quoting/processing).
   * Precedence: operations > tags > global (most-specific-wins).
   */
  paramOverrides: ParamOverridesSchema,
});

export type ExamplesConfig = z.infer<typeof ExamplesConfigSchema>;
export type BoilerplateConfig = z.infer<typeof BoilerplateSchema>;
