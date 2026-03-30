import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toPascalCase(str: string): string {
  // If already PascalCase, return as-is
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) {
    return str;
  }
  // If camelCase, just uppercase first char
  if (/^[a-z][a-zA-Z0-9]*$/.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  // Handle kebab-case, snake_case, or space-separated
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_|_$/g, '');
}

function wrapOverrideForType(override: string, schema: NormalizedSchema): string {
  if (schema.type === 'string' && !(schema.format === 'date' || schema.format === 'date-time')) {
    return `"${override}"`;
  }
  return override;
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
        return 'time.Now()';
      }
      return `"${name}_value"`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
    case 'object':
      if (schema.properties) {
        return buildStructLiteral(schema, 0);
      }
      return 'map[string]interface{}{}';
    case 'array':
      if (schema.items) {
        const itemValue = exampleValueForSchema(schema.items, 'item');
        return `[]${mapGoType(schema.items)}{${itemValue}}`;
      }
      return '[]interface{}{}';
    default:
      return `"${name}_value"`;
  }
}

function mapGoType(schema: NormalizedSchema): string {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date' || schema.format === 'date-time') {
        return 'time.Time';
      }
      return 'string';
    case 'integer':
      if (schema.format === 'int32') {
        return 'int32';
      }
      return 'int64';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    case 'array':
      if (schema.items) {
        return `[]${mapGoType(schema.items)}`;
      }
      return '[]interface{}';
    case 'object':
      return 'map[string]interface{}';
    default:
      return 'interface{}';
  }
}

function buildStructLiteral(
  schema: NormalizedSchema,
  depth: number,
  valueOverrides?: Record<string, string>,
): string {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const indent = '\t'.repeat(depth + 1);
  const closingIndent = depth > 0 ? '\t'.repeat(depth) : '';

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(props)) {
    if (required.includes(propName)) {
      const override = valueOverrides?.[propName];
      const fieldName = toPascalCase(propName);
      let value: string;
      if (override != null) {
        value = wrapOverrideForType(override, propSchema);
      } else if (propSchema.type === 'object' && propSchema.properties) {
        value = buildStructLiteral(propSchema, depth + 1);
      } else {
        value = exampleValueForSchema(propSchema, propName);
      }
      entries.push(`${indent}${fieldName}: ${value},`);
    }
  }

  if (entries.length === 0) return '{}';
  return '{\n' + entries.join('\n') + '\n' + closingIndent + '}';
}

const goAdapter: LanguageAdapter = {
  id: 'go',
  generatorNames: ['go', 'go-server', 'go-gin-server'],
  codeBlockLang: 'go',

  toMethodName(operationId: string): string {
    return toPascalCase(operationId);
  },

  toFileName(operationId: string): string {
    return toSnakeCase(operationId);
  },

  toTagDirectory(tag: string): string {
    return toSnakeCase(tag);
  },

  toApiClassName(tag: string): string {
    const stripped = tag.replace(/\s+(.)/g, (_, c: string) => c.toUpperCase()).replace(/\s+/g, '');
    return stripped.charAt(0).toUpperCase() + stripped.slice(1) + 'API';
  },

  mapType(schema: NormalizedSchema): string {
    return mapGoType(schema);
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return typeof param.example === 'string' ? `"${param.example}"` : String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const value = valueOverride != null
      ? wrapOverrideForType(valueOverride, param.schema)
      : this.exampleValue(param);
    return `${param.name} := ${value}`;
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
    if (!body.schemaName) {
      const literal = buildStructLiteral(body.schema, 0, valueOverrides);
      return `body := map[string]interface{}${literal}`;
    }
    const literal = buildStructLiteral(body.schema, 0, valueOverrides);
    return `body := openapi.${body.schemaName}${literal}`;
  },

  buildResultLine(call: string, _returnType: string | undefined): string {
    return `resp, r, err := ${call}`;
  },
};

registerLanguage(goAdapter);
