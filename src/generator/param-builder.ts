import type { LanguageAdapter } from '../languages/types.js';
import type { NormalizedOperation, NormalizedParam, NormalizedRequestBody } from '../spec/types.js';

/**
 * Build parameter declaration code for an operation's required parameters.
 * Returns a multi-line string of variable declarations.
 */
export function buildParamDeclarations(
  op: NormalizedOperation,
  adapter: LanguageAdapter,
): string {
  const declarations = op.parameters
    .filter((p) => !p.deprecated && p.required)
    .map((p) => adapter.buildParamDeclaration(p))
    .filter(Boolean);

  return declarations.join('\n');
}

/**
 * Build request body construction code.
 */
export function buildBodyCode(
  body: NormalizedRequestBody | undefined,
  adapter: LanguageAdapter,
): string {
  if (!body) return '';
  return adapter.buildBodyConstruction(body);
}

/**
 * Build the argument list string for a method call.
 * Includes required params by variable name and body as 'body'.
 */
export function buildArgList(
  op: NormalizedOperation,
): string {
  const args: string[] = [];

  for (const p of op.parameters) {
    if (p.deprecated || !p.required) continue;
    args.push(p.name);
  }

  if (op.requestBody) {
    args.push('body');
  }

  return args.join(', ');
}

/**
 * Generate an example value for a single parameter, using spec metadata.
 * Falls back to the language adapter's default example value generation.
 */
export function exampleValueForParam(
  param: NormalizedParam,
  adapter: LanguageAdapter,
): string {
  return adapter.exampleValue(param);
}
