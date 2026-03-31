import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';
import { registerLanguage } from './registry.js';

function toCamelCase(str: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
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
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function wrapOverrideForType(override: string, schema: NormalizedSchema): string {
  if (schema.type === 'string' && !(schema.format === 'date' || schema.format === 'date-time')) {
    return `"${override}"`;
  }
  return override;
}

function mapTypeForSchema(schema: NormalizedSchema): string {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date') return 'LocalDate';
      if (schema.format === 'date-time') return 'OffsetDateTime';
      return 'String';
    case 'integer':
      if (schema.format === 'int64') return 'Long';
      return 'Integer';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    case 'array':
      if (schema.items) {
        return `List<${mapTypeForSchema(schema.items)}>`;
      }
      return 'List<Object>';
    case 'object':
      return 'Object';
    default:
      return 'Object';
  }
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
      if (schema.format === 'date') return 'LocalDate.now()';
      if (schema.format === 'date-time') return 'OffsetDateTime.now()';
      return `"${name}_value"`;
    case 'integer':
      return '0';
    case 'number':
      return '0D';
    case 'boolean':
      return 'true';
    case 'object':
      return '{}';
    case 'array':
      if (schema.items) {
        const itemValue = exampleValueForSchema(schema.items, 'item');
        return `Arrays.asList(${itemValue})`;
      }
      return 'Arrays.asList()';
    default:
      return `"${name}_value"`;
  }
}

function buildSetterBody(
  body: NormalizedRequestBody,
  valueOverrides?: Record<string, string>,
): string {
  const schema = body.schema;
  const typeName = body.schemaName ?? 'Object';
  const props = schema.properties ?? {};
  const required = schema.required ?? [];

  const lines: string[] = [];
  lines.push(`${typeName} body = new ${typeName}();`);

  for (const [propName, propSchema] of Object.entries(props)) {
    if (required.includes(propName)) {
      const setter = `set${toPascalCase(propName)}`;
      const override = valueOverrides?.[propName];
      let value: string;
      if (override != null) {
        value = wrapOverrideForType(override, propSchema);
      } else {
        value = exampleValueForSchema(propSchema, propName);
      }
      lines.push(`body.${setter}(${value});`);
    }
  }

  return lines.join('\n');
}

const javaAdapter: LanguageAdapter = {
  id: 'java',
  generatorNames: ['java', 'java-helidon-client', 'java-helidon-server', 'java-micronaut-client'],
  codeBlockLang: 'java',

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
    if (schema.type === 'object' && schema.properties) {
      // Named schema — but we don't have a name here, so return Object
      return 'Object';
    }
    return mapTypeForSchema(schema);
  },

  exampleValue(param: NormalizedParam): string {
    if (param.example != null) {
      return typeof param.example === 'string' ? `"${param.example}"` : String(param.example);
    }
    return exampleValueForSchema(param.schema, param.name);
  },

  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string {
    const javaType = this.mapType(param.schema);
    const value = valueOverride != null
      ? wrapOverrideForType(valueOverride, param.schema)
      : this.exampleValue(param);
    return `${javaType} ${toCamelCase(param.name)} = ${value};`;
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
    return buildSetterBody(body, valueOverrides);
  },

  buildResultLine(call: string, returnType: string | undefined): string {
    if (returnType) {
      return `${returnType} result = ${call};`;
    }
    return `${call};`;
  },
};

registerLanguage(javaAdapter);
