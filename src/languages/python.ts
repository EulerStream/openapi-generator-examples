import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toSnakeCase(str: string): string {
  // Insert underscore before uppercase letters that follow lowercase letters or digits
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_|_$/g, '');
}

function toPascalCase(str: string): string {
  // Strip spaces and uppercase the char after each space, preserve existing casing otherwise
  return str.replace(/\s+(.)/g, (_, c: string) => c.toUpperCase()).replace(/\s+/g, '');
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
        return 'datetime.now()';
      }
      return `"${name}_value"`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'True';
    case 'object':
      if (schema.properties) {
        return buildObjectLiteral(schema, 0);
      }
      return '{}';
    case 'array':
      if (schema.items) {
        const itemValue = exampleValueForSchema(schema.items, 'item');
        return `[${itemValue}]`;
      }
      return '[]';
    default:
      return `"${name}_value"`;
  }
}

function buildObjectLiteral(
  schema: NormalizedSchema,
  depth: number,
  valueOverrides?: Record<string, string>,
  schemaName?: string,
): string {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const indent = '    '.repeat(depth + 1);
  const closingIndent = depth > 0 ? '    '.repeat(depth) : '';

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(props)) {
    if (required.includes(propName)) {
      const override = valueOverrides?.[propName];
      let value: string;
      if (override != null) {
        value = wrapOverrideForType(override, propSchema);
      } else if (propSchema.type === 'object' && propSchema.properties) {
        value = buildObjectLiteral(propSchema, depth + 1);
      } else {
        value = exampleValueForSchema(propSchema, propName);
      }
      entries.push(`${indent}${propName}=${value},`);
    }
  }

  if (entries.length === 0) {
    return schemaName ? `${schemaName}()` : '{}';
  }

  const opener = schemaName ? `${schemaName}(\n` : '{\n';
  const closer = schemaName ? `${closingIndent})` : `${closingIndent}}`;
  return opener + entries.join('\n') + '\n' + closer;
}

const pythonAdapter: LanguageAdapter = {
  id: 'python',
  generatorNames: ['python', 'python-pydantic-v1', 'python-nextgen', 'python-prior'],
  codeBlockLang: 'python',

  toMethodName(operationId: string): string {
    return toSnakeCase(operationId);
  },

  toFileName(operationId: string): string {
    return toSnakeCase(operationId);
  },

  toTagDirectory(tag: string): string {
    return toSnakeCase(tag);
  },

  toApiClassName(tag: string): string {
    const stripped = toPascalCase(tag);
    const capitalized = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    return capitalized + 'Api';
  },

  mapType(schema: NormalizedSchema): string {
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date' || schema.format === 'date-time') {
          return 'datetime';
        }
        return 'str';
      case 'integer':
        return 'int';
      case 'number':
        return 'float';
      case 'boolean':
        return 'bool';
      case 'array':
        if (schema.items) {
          return `list[${this.mapType(schema.items)}]`;
        }
        return 'list';
      case 'object':
        return 'dict';
      default:
        return 'object';
    }
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return typeof param.example === 'string' ? `"${param.example}"` : String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const pyType = this.mapType(param.schema);
    const value = valueOverride != null
      ? wrapOverrideForType(valueOverride, param.schema)
      : this.exampleValue(param);
    return `${param.name}: ${pyType} = ${value}`;
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
    const literal = buildObjectLiteral(body.schema, 0, valueOverrides, body.schemaName);
    return `body = ${literal}`;
  },

  buildResultLine(call: string, _returnType: string | undefined): string {
    return `result = ${call}`;
  },
};

registerLanguage(pythonAdapter);
