import * as fs from 'fs';
import * as path from 'path';
import type { TemplateContext } from '../templates/context.js';
import type { NormalizedOperation } from '../spec/types.js';
import type { LanguageAdapter } from '../languages/types.js';

export type OutputFormat = 'md' | 'json';

export interface OperationJson {
  operationId: string;
  tag: string;
  httpMethod: string;
  path: string;
  description: string;
  example: string;
  codeBlockLang: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  requestBody?: {
    typeName: string;
    construction: string;
  };
}

/**
 * Write per-operation output files in the requested formats.
 */
export function writeOperationFile(
  outputDir: string,
  op: NormalizedOperation,
  renderedExample: string,
  context: TemplateContext,
  adapter: LanguageAdapter,
  formats: OutputFormat[],
): string[] {
  const tagDir = adapter.toTagDirectory(op.tag);
  const fileName = adapter.toFileName(op.operationId);
  const dirPath = path.join(outputDir, adapter.id, tagDir);

  fs.mkdirSync(dirPath, { recursive: true });

  const written: string[] = [];

  if (formats.includes('md')) {
    const mdPath = path.join(dirPath, fileName + '.md');
    const md = buildMarkdown(op, renderedExample, context);
    fs.writeFileSync(mdPath, md, 'utf-8');
    written.push(mdPath);
  }

  if (formats.includes('json')) {
    const jsonPath = path.join(dirPath, fileName + '.json');
    const json = buildJson(op, renderedExample, context);
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
    written.push(jsonPath);
  }

  return written;
}

/**
 * Write an index.md for a language listing all operations.
 */
export function writeLanguageIndex(
  outputDir: string,
  adapter: LanguageAdapter,
  operations: NormalizedOperation[],
): void {
  const dirPath = path.join(outputDir, adapter.id);
  fs.mkdirSync(dirPath, { recursive: true });

  const byTag = new Map<string, NormalizedOperation[]>();
  for (const op of operations) {
    const tag = op.tag;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag)!.push(op);
  }

  const lines: string[] = [`# Usage Examples (${adapter.id})`, ''];

  for (const [tag, ops] of byTag) {
    const tagDir = adapter.toTagDirectory(tag);
    lines.push(`## ${tag}`, '');
    lines.push('| Operation | Method | Path |');
    lines.push('|-----------|--------|------|');
    for (const op of ops) {
      const fileName = adapter.toFileName(op.operationId);
      lines.push(`| [${op.operationId}](./${tagDir}/${fileName}.md) | ${op.httpMethod} | \`${op.path}\` |`);
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(dirPath, 'index.md'), lines.join('\n'), 'utf-8');
}

function buildJson(
  op: NormalizedOperation,
  renderedExample: string,
  context: TemplateContext,
): OperationJson {
  const json: OperationJson = {
    operationId: op.operationId,
    tag: op.tag,
    httpMethod: op.httpMethod,
    path: op.path,
    description: op.description ?? '',
    example: renderedExample.trimEnd(),
    codeBlockLang: context.codeBlockLang,
    parameters: context.params.map((p) => ({
      name: p.name,
      type: p.type,
      required: p.required,
      description: p.description,
    })),
  };

  if (context.hasBody && context.bodyTypeName) {
    json.requestBody = {
      typeName: context.bodyTypeName,
      construction: context.bodyConstruction,
    };
  }

  return json;
}

function buildMarkdown(
  op: NormalizedOperation,
  renderedExample: string,
  context: TemplateContext,
): string {
  const lines: string[] = [];

  lines.push(`# ${op.operationId}`);
  lines.push('');

  if (op.description) {
    lines.push(op.description);
    lines.push('');
  }

  lines.push(`\`${op.httpMethod} ${op.path}\``);
  lines.push('');

  lines.push('## Example');
  lines.push('');
  lines.push(`\`\`\`${context.codeBlockLang}`);
  lines.push(renderedExample.trimEnd());
  lines.push('```');
  lines.push('');

  if (context.params.length > 0) {
    lines.push('## Parameters');
    lines.push('');
    lines.push('| Name | Type | Required | Description |');
    lines.push('|------|------|----------|-------------|');
    for (const p of context.params) {
      const req = p.required ? 'Yes' : 'No';
      const desc = p.description || '-';
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${req} | ${desc} |`);
    }
    lines.push('');
  }

  if (context.hasBody) {
    lines.push('## Request Body');
    lines.push('');
    lines.push(`Type: \`${context.bodyTypeName}\``);
    lines.push('');
  }

  return lines.join('\n');
}
