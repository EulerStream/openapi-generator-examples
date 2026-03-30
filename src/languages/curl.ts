import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
}

// Module-level state for accumulating params during template context building
let currentParams: Array<{ param: NormalizedParam; value: string }> = [];

function wrapOverrideForType(override: string, schema: NormalizedSchema): string {
  if (schema.type === 'string') {
    return `"${override}"`;
  }
  return override;
}

function exampleValueForSchema(schema: NormalizedSchema, name: string): string {
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (schema.default != null) {
    return String(schema.default);
  }
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date' || schema.format === 'date-time') {
        return '2024-01-01';
      }
      return `${name}_value`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
    case 'object':
      return '{}';
    case 'array':
      return '[]';
    default:
      return `${name}_value`;
  }
}

function jsonValue(schema: NormalizedSchema, name: string, depth: number): string {
  if (schema.enum && schema.enum.length > 0) {
    return `"${schema.enum[0]}"`;
  }
  if (schema.default != null) {
    return typeof schema.default === 'string' ? `"${schema.default}"` : String(schema.default);
  }
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date' || schema.format === 'date-time') {
        return '"2024-01-01"';
      }
      return `"${name}_value"`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
    case 'object':
      if (schema.properties) {
        return buildJsonObject(schema, depth);
      }
      return '{}';
    case 'array':
      if (schema.items) {
        return `[${jsonValue(schema.items, 'item', depth)}]`;
      }
      return '[]';
    default:
      return `"${name}_value"`;
  }
}

function buildJsonObject(
  schema: NormalizedSchema,
  depth: number,
  valueOverrides?: Record<string, string>,
): string {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const indent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(props)) {
    if (required.includes(propName)) {
      const override = valueOverrides?.[propName];
      let value: string;
      if (override != null) {
        value = wrapOverrideForType(override, propSchema);
      } else if (propSchema.type === 'object' && propSchema.properties) {
        value = buildJsonObject(propSchema, depth + 1);
      } else {
        value = jsonValue(propSchema, propName, depth + 1);
      }
      entries.push(`${indent}"${propName}": ${value}`);
    }
  }

  if (entries.length === 0) return '{}';
  return '{\n' + entries.join(',\n') + '\n' + closingIndent + '}';
}

const curlAdapter: LanguageAdapter = {
  id: 'curl',
  generatorNames: ['curl'],
  codeBlockLang: 'bash',

  toMethodName(operationId: string): string {
    return toKebabCase(operationId);
  },

  toFileName(operationId: string): string {
    return toKebabCase(operationId);
  },

  toTagDirectory(tag: string): string {
    return toKebabCase(tag);
  },

  toApiClassName(tag: string): string {
    return tag;
  },

  mapType(schema: NormalizedSchema): string {
    return schema.type || 'string';
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const value = valueOverride ?? this.exampleValue(param);
    currentParams.push({ param, value });
    return `# ${param.name} = ${value}`;
  },

  buildMethodCall(_opts: MethodCallOptions): string {
    const queryParams = currentParams
      .filter(({ param }) => param.in === 'query')
      .map(({ param, value }) => `${param.name}=${encodeURIComponent(value)}`)
      .join('&');
    currentParams = [];
    return queryParams ? `?${queryParams}` : '';
  },

  buildBodyConstruction(body: NormalizedRequestBody, valueOverrides?: Record<string, string>): string {
    const json = buildJsonObject(body.schema, 1, valueOverrides);
    return `  -d '${json}'`;
  },

  buildResultLine(_call: string, _returnType: string | undefined): string {
    return '';
  },
};

registerLanguage(curlAdapter);
