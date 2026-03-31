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

function toPascalCase(str: string): string {
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) return str;
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '')
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function enumKeyFromValue(value: unknown): string {
  const str = String(value);
  // Convert SCREAMING_SNAKE_CASE to PascalCase: FANS_TEAM_RANK → FansTeamRank
  return str
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function buildEnumTypeName(operationId: string, paramName: string): string {
  return toPascalCase(operationId) + toPascalCase(paramName) + 'Enum';
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
        return 'new Date()';
      }
      return `"${name}_value"`;
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
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
): string {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const indent = '  '.repeat(depth + 1);
  const closingIndent = depth > 0 ? '  '.repeat(depth) : '';

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
      entries.push(`${indent}${propName}: ${value},`);
    }
  }

  if (entries.length === 0) return '{}';
  return '{\n' + entries.join('\n') + '\n' + closingIndent + '}';
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

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string, operationId?: string): string {
    // Enum parameters get their generated enum type and value
    if (param.schema.enum && param.schema.enum.length > 0 && operationId && !valueOverride) {
      const enumTypeName = buildEnumTypeName(operationId, param.name);
      const enumKey = enumKeyFromValue(param.schema.enum[0]);
      return `let ${param.name}: ${enumTypeName} = ${enumTypeName}.${enumKey};`;
    }

    const tsType = this.mapType(param.schema);
    const value = valueOverride != null
      ? wrapOverrideForType(valueOverride, param.schema)
      : this.exampleValue(param);
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
    const objectLiteral = buildObjectLiteral(body.schema, 0, valueOverrides);
    const typeName = body.schemaName ?? 'Record<string, unknown>';

    return `const body: ${typeName} = ` + objectLiteral + ';';
  },

  buildResultLine(call: string, returnType: string | undefined): string {
    if (returnType) {
      return `const { status, data } = await ${call};`;
    }
    return `await ${call};`;
  },
};

registerLanguage(typescriptAdapter);
