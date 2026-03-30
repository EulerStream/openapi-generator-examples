// Core API
export { generate, type GenerateOptions, type GenerateResult } from './generator/pipeline.js';

// Config
export { loadConfig, loadConfigOrDefault } from './config/loader.js';
export { ExamplesConfigSchema, type ExamplesConfig, type BoilerplateConfig, ParamOverridesSchema } from './config/schema.js';

// Spec parsing
export { parseSpec } from './spec/parser.js';
export type {
  NormalizedOperation,
  NormalizedParam,
  NormalizedRequestBody,
  NormalizedSchema,
} from './spec/types.js';

// Language adapters
export type { LanguageAdapter, MethodCallOptions } from './languages/types.js';
export {
  registerLanguage,
  getLanguageByGenerator,
  getLanguageById,
  getAllLanguages,
} from './languages/registry.js';

// Writer
export type { OutputFormat, OperationJson } from './generator/writer.js';

// Template system
export { renderTemplate, getDefaultTemplatePath } from './templates/renderer.js';
export { buildTemplateContext, type TemplateContext, type TemplateParam } from './templates/context.js';

// Register built-in language adapters (side-effect import)
import './languages/register-all.js';
