import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toCamelCase(str: string): string {
  // If already camelCase/PascalCase, just lowercase the first char
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  // Handle kebab-case, snake_case, or space-separated
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
}

function exampleValueForSchema(schema: NormalizedSchema, name: string): string {
  if (schema.enum && schema.enum.length > 0) {
    return `"${schema.enum[0]}"`;
  }
  if (schema.default != null) {
    return typeof schema.default === 'string' ? `"${schema.default}"` : String(schema.default);
  }
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date' || schema.format === 'date-time') {
        return 'new Date()';
      }
      return `"${name}_value"`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
    default:
      return `"${name}_value"`;
  }
}

const typescriptAdapter: LanguageAdapter = {
  id: 'typescript',
  generatorNames: ['typescript-axios', 'typescript-fetch', 'typescript-angular', 'typescript-node', 'typescript'],
  codeBlockLang: 'typescript',

  toMethodName(operationId: string): string {
    return toCamelCase(operationId);
  },

  toFileName(operationId: string): string {
    return toCamelCase(operationId);
  },

  toTagDirectory(tag: string): string {
    return toKebabCase(tag);
  },

  toApiClassName(tag: string): string {
    const stripped = tag.replace(/\s+(.)/g, (_, c: string) => c.toUpperCase()).replace(/\s+/g, '');
    return stripped.charAt(0).toUpperCase() + stripped.slice(1) + 'Api';
  },

  mapType(schema: NormalizedSchema): string {
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date' || schema.format === 'date-time') {
          return 'Date';
        }
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        if (schema.items) {
          return `${this.mapType(schema.items)}[]`;
        }
        return 'unknown[]';
      case 'object':
        return 'Record<string, unknown>';
      default:
        return 'unknown';
    }
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return typeof param.example === 'string' ? `"${param.example}"` : String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const tsType = this.mapType(param.schema);
    const value = valueOverride ?? this.exampleValue(param);
    return `let ${param.name}: ${tsType} = ${value};`;
  },

  buildMethodCall(opts: MethodCallOptions): string {
    const { clientVar, apiProperty, methodName, args, apiAccessPattern } = opts;
    if (apiAccessPattern === 'direct') {
      return `${clientVar}.${methodName}(${args})`;
    }
    if (apiAccessPattern === 'call') {
      return `${clientVar}.${apiProperty}().${methodName}(${args})`;
    }
    return `${clientVar}.${apiProperty}.${methodName}(${args})`;
  },

  buildBodyConstruction(body: NormalizedRequestBody, valueOverrides?: Record<string, string>): string {
    const props = body.schema.properties ?? {};
    const required = body.schema.required ?? [];

    const entries: string[] = [];
    for (const [propName, propSchema] of Object.entries(props)) {
      if (required.includes(propName)) {
        const value = valueOverrides?.[propName] ?? exampleValueForSchema(propSchema, propName);
        entries.push(`  ${propName}: ${value},`);
      }
    }

    const opening = body.schemaName
      ? `const body: ${body.schemaName} = {`
      : `const body = {`;

    const lines = [opening];
    lines.push(...entries);
    lines.push('};');
    return lines.join('\n');
  },

  buildResultLine(call: string, returnType: string | undefined): string {
    if (returnType) {
      return `const { status, data } = await ${call};`;
    }
    return `await ${call};`;
  },
};

registerLanguage(typescriptAdapter);
