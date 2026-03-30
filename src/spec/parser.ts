import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import type {
  NormalizedOperation,
  NormalizedParam,
  NormalizedRequestBody,
  NormalizedSchema,
} from './types.js';

type OpenAPISpec = Record<string, unknown>;

export function parseSpec(specPath: string): NormalizedOperation[] {
  const raw = fs.readFileSync(specPath, 'utf-8');
  const spec: OpenAPISpec = specPath.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
  return extractOperations(spec);
}

function extractOperations(spec: OpenAPISpec): NormalizedOperation[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const operations: NormalizedOperation[] = [];

  for (const [urlPath, methods] of Object.entries(paths)) {
    for (const [method, opDef] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].indexOf(method) === -1) {
        continue;
      }

      const op = opDef as Record<string, unknown>;
      if (!op.operationId) continue;

      operations.push({
        operationId: op.operationId as string,
        tag: ((op.tags as string[]) ?? ['Default'])[0],
        httpMethod: method.toUpperCase(),
        path: urlPath,
        description: op.description as string | undefined,
        parameters: normalizeParams(op.parameters as unknown[] | undefined, spec),
        requestBody: normalizeRequestBody(op.requestBody as Record<string, unknown> | undefined, spec),
        responseType: extractResponseType(op.responses as Record<string, unknown> | undefined, spec),
        security: extractSecurity(op.security as Record<string, unknown>[] | undefined),
      });
    }
  }

  return operations;
}

function normalizeParams(
  params: unknown[] | undefined,
  spec: OpenAPISpec,
): NormalizedParam[] {
  if (!params) return [];

  return params.map((p) => {
    const param = resolveRef(p as Record<string, unknown>, spec) as Record<string, unknown>;
    const schema = resolveRef(
      (param.schema as Record<string, unknown>) ?? { type: 'string' },
      spec,
    ) as Record<string, unknown>;

    return {
      name: param.name as string,
      in: param.in as NormalizedParam['in'],
      required: (param.required as boolean) ?? false,
      schema: normalizeSchema(schema, spec),
      description: param.description as string | undefined,
      example: param.example,
      deprecated: (param.deprecated as boolean) ?? false,
    };
  });
}

function normalizeRequestBody(
  body: Record<string, unknown> | undefined,
  spec: OpenAPISpec,
): NormalizedRequestBody | undefined {
  if (!body) return undefined;

  const resolved = resolveRef(body, spec) as Record<string, unknown>;
  const content = resolved.content as Record<string, Record<string, unknown>> | undefined;
  if (!content) return undefined;

  // Prefer application/json
  const jsonContent = content['application/json'] ?? Object.values(content)[0];
  if (!jsonContent?.schema) return undefined;

  const rawSchema = jsonContent.schema as Record<string, unknown>;
  const schemaName = extractRefName(rawSchema);
  const resolvedSchema = resolveRef(rawSchema, spec) as Record<string, unknown>;

  return {
    required: (resolved.required as boolean) ?? false,
    schemaName: schemaName,
    schema: normalizeSchema(resolvedSchema, spec),
  };
}

function normalizeSchema(
  schema: Record<string, unknown>,
  spec: OpenAPISpec,
): NormalizedSchema {
  const resolved = resolveRef(schema, spec) as Record<string, unknown>;

  const result: NormalizedSchema = {
    type: (resolved.type as string) ?? 'object',
  };

  if (resolved.format) result.format = resolved.format as string;
  if (resolved.enum) result.enum = resolved.enum as string[];
  if (resolved.default !== undefined) result.default = resolved.default;
  if (resolved.description) result.description = resolved.description as string;

  if (resolved.items) {
    result.items = normalizeSchema(
      resolveRef(resolved.items as Record<string, unknown>, spec) as Record<string, unknown>,
      spec,
    );
  }

  if (resolved.properties) {
    const props = resolved.properties as Record<string, Record<string, unknown>>;
    result.properties = {};
    for (const [name, propSchema] of Object.entries(props)) {
      result.properties[name] = normalizeSchema(
        resolveRef(propSchema, spec) as Record<string, unknown>,
        spec,
      );
    }
    result.required = (resolved.required as string[]) ?? [];
  }

  return result;
}

function extractResponseType(
  responses: Record<string, unknown> | undefined,
  spec: OpenAPISpec,
): string | undefined {
  if (!responses) return undefined;

  const successResponse = (responses['200'] ?? responses['201']) as Record<string, unknown> | undefined;
  if (!successResponse) return undefined;

  const resolved = resolveRef(successResponse, spec) as Record<string, unknown>;
  const content = resolved.content as Record<string, Record<string, unknown>> | undefined;
  if (!content) return undefined;

  const jsonContent = content['application/json'] ?? Object.values(content)[0];
  if (!jsonContent?.schema) return undefined;

  return extractRefName(jsonContent.schema as Record<string, unknown>)
    ?? (jsonContent.schema as Record<string, unknown>).type as string | undefined;
}

function extractSecurity(security: Record<string, unknown>[] | undefined): string[] {
  if (!security) return [];
  const names: string[] = [];
  for (const scheme of security) {
    names.push(...Object.keys(scheme));
  }
  return [...new Set(names)];
}

function resolveRef(obj: Record<string, unknown>, spec: OpenAPISpec): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;
  const ref = obj['$ref'] as string | undefined;
  if (!ref) return obj;

  // Resolve JSON pointer: "#/components/schemas/Foo"
  const parts = ref.replace(/^#\//, '').split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return obj;
    }
  }

  if (current && typeof current === 'object') {
    return current as Record<string, unknown>;
  }
  return obj;
}

function extractRefName(schema: Record<string, unknown>): string | undefined {
  const ref = schema['$ref'] as string | undefined;
  if (!ref) return undefined;
  const parts = ref.split('/');
  return parts[parts.length - 1];
}
