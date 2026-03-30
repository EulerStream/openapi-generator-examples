import * as fs from 'fs';
import * as path from 'path';
import Mustache from 'mustache';
import type { TemplateContext } from './context.js';

// Disable HTML escaping — we're generating code, not HTML
Mustache.escape = (text: string) => text;

const templateCache = new Map<string, string>();

export function renderTemplate(
  templatePath: string,
  context: TemplateContext,
): string {
  const template = loadTemplate(templatePath);
  const rendered = Mustache.render(template, context);

  // Clean up excessive blank lines (3+ -> 2)
  return rendered.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function getDefaultTemplatePath(languageId: string): string {
  // In development, resolve from src/; in production, from dist/
  const srcPath = path.resolve(
    import.meta.dirname ?? __dirname,
    'defaults',
    `${languageId}.mustache`,
  );
  if (fs.existsSync(srcPath)) return srcPath;

  // Fallback for bundled dist
  const distPath = path.resolve(
    import.meta.dirname ?? __dirname,
    '..', 'templates', 'defaults',
    `${languageId}.mustache`,
  );
  if (fs.existsSync(distPath)) return distPath;

  throw new Error(
    `No default template found for language "${languageId}". ` +
    `Searched: ${srcPath}, ${distPath}`,
  );
}

function loadTemplate(templatePath: string): string {
  const cached = templateCache.get(templatePath);
  if (cached) return cached;

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, 'utf-8');
  templateCache.set(templatePath, content);
  return content;
}
