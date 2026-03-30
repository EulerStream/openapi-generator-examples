import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toPascalCase(str: string): string {
  // If already camelCase/PascalCase, just uppercase the first char
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  // Handle kebab-case, snake_case, or space-separated
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '')
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toTagDirectoryName(str: string): string {
  // Split on spaces, keep first word as-is, title-case subsequent words
  return str
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

function csharpType(schema: NormalizedSchema): string {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date' || schema.format === 'date-time') return 'DateTime';
      return 'string';
    case 'integer':
      if (schema.format === 'int64') return 'long';
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'array':
      if (schema.items) return `List<${csharpType(schema.items)}>`;
      return 'List<object>';
    case 'object':
      return 'object';
    default:
      return 'object';
  }
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
        return 'DateTime.Now';
      }
      return `"${name}_value"`;
    case 'integer':
      return '0';
    case 'number':
      return '0.0';
    case 'boolean':
      return 'true';
    case 'object':
      if (schema.properties) {
        return buildObjectInitializer(schema, 0);
      }
      return 'new { }';
    case 'array':
      if (schema.items) {
        const itemType = csharpType(schema.items);
        const itemValue = exampleValueForSchema(schema.items, 'item');
        return `new List<${itemType}> { ${itemValue} }`;
      }
      return 'new List<object>()';
    default:
      return `"${name}_value"`;
  }
}

function buildObjectInitializer(
  schema: NormalizedSchema,
  depth: number,
  valueOverrides?: Record<string, string>,
): string {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const indent = '    '.repeat(depth + 1);
  const closingIndent = depth > 0 ? '    '.repeat(depth) : '';

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(props)) {
    if (required.includes(propName)) {
      const override = valueOverrides?.[propName];
      const pascalName = propName.charAt(0).toUpperCase() + propName.slice(1);
      let value: string;
      if (override != null) {
        value = wrapOverrideForType(override, propSchema);
      } else if (propSchema.type === 'object' && propSchema.properties) {
        value = 'new\n' + indent + buildObjectInitializer(propSchema, depth + 1);
      } else {
        value = exampleValueForSchema(propSchema, propName);
      }
      entries.push(`${indent}${pascalName} = ${value},`);
    }
  }

  if (entries.length === 0) return '{ }';
  return '{\n' + entries.join('\n') + '\n' + closingIndent + '}';
}

const csharpAdapter: LanguageAdapter = {
  id: 'csharp',
  generatorNames: ['csharp', 'csharp-netcore', 'csharp-functions'],
  codeBlockLang: 'csharp',

  toMethodName(operationId: string): string {
    return toPascalCase(operationId);
  },

  toFileName(operationId: string): string {
    return toPascalCase(operationId);
  },

  toTagDirectory(tag: string): string {
    return toTagDirectoryName(tag);
  },

  toApiClassName(tag: string): string {
    const stripped = tag.replace(/\s+(.)/g, (_, c: string) => c.toUpperCase()).replace(/\s+/g, '');
    return stripped.charAt(0).toUpperCase() + stripped.slice(1) + 'Api';
  },

  mapType(schema: NormalizedSchema): string {
    return csharpType(schema);
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return typeof param.example === 'string' ? `"${param.example}"` : String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const type = this.mapType(param.schema);
    const value = valueOverride != null
      ? wrapOverrideForType(valueOverride, param.schema)
      : this.exampleValue(param);
    return `${type} ${param.name} = ${value};`;
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
    const initializer = buildObjectInitializer(body.schema, 0, valueOverrides);
    const typeName = body.schemaName ? ` ${body.schemaName}` : '';
    return `var body = new${typeName}\n${initializer};`;
  },

  buildResultLine(call: string, returnType: string | undefined): string {
    if (returnType) {
      return `${returnType} result = ${call};`;
    }
    return `${call};`;
  },
};

registerLanguage(csharpAdapter);
