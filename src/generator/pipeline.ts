import * as path from 'path';
import type { ExamplesConfig } from '../config/schema.js';
import type { LanguageAdapter } from '../languages/types.js';
import { getLanguageByGenerator, getLanguageById } from '../languages/registry.js';
import { parseSpec } from '../spec/parser.js';
import { buildTemplateContext } from '../templates/context.js';
import { renderTemplate, getDefaultTemplatePath } from '../templates/renderer.js';
import { writeOperationFile, writeLanguageIndex } from './writer.js';
import type { OutputFormat } from './writer.js';

export interface GenerateOptions {
  /** Path to the OpenAPI spec (JSON or YAML) */
  inputSpec: string;
  /** Generator name (e.g., 'java', 'typescript-axios') or language id */
  generator: string;
  /** Base output directory (usage/ will be created inside or alongside this) */
  outputDir: string;
  /** Loaded config */
  config: ExamplesConfig;
}

export interface GenerateResult {
  languageId: string;
  filesWritten: string[];
  operationCount: number;
}

export function generate(options: GenerateOptions): GenerateResult {
  const { inputSpec, generator, outputDir, config } = options;

  // Resolve language adapter
  const adapter = getLanguageByGenerator(generator) ?? getLanguageById(generator);
  if (!adapter) {
    const msg = `Unknown generator/language: "${generator}". ` +
      `No language adapter registered for this identifier.`;
    throw new Error(msg);
  }

  // Determine output path
  const usageDir = config.output
    ? path.resolve(config.output)
    : path.resolve(outputDir, 'usage');

  // Parse spec
  const operations = parseSpec(inputSpec);
  if (operations.length === 0) {
    console.warn('No operations found in the OpenAPI spec.');
    return { languageId: adapter.id, filesWritten: [], operationCount: 0 };
  }

  // Resolve template
  const templatePath = config.templatePath
    ? path.resolve(config.templatePath)
    : getDefaultTemplatePath(adapter.id);

  // Resolve output formats
  const formats: OutputFormat[] = config.outputFormats.length > 0
    ? config.outputFormats
    : ['md'];

  // Generate per-operation files
  const filesWritten: string[] = [];

  for (const op of operations) {
    const context = buildTemplateContext(op, config, adapter);
    const rendered = renderTemplate(templatePath, context);
    const filePaths = writeOperationFile(usageDir, op, rendered, context, adapter, formats);
    filesWritten.push(...filePaths);
  }

  // Write index
  writeLanguageIndex(usageDir, adapter, operations);

  return {
    languageId: adapter.id,
    filesWritten,
    operationCount: operations.length,
  };
}
