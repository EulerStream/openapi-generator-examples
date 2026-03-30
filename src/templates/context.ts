import type { ExamplesConfig } from '../config/schema.js';
import type { LanguageAdapter } from '../languages/types.js';
import type { NormalizedOperation, NormalizedParam } from '../spec/types.js';

export interface TemplateParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue: string;
  exampleValue: string;
  hasDefault: boolean;
}

export interface TemplateContext {
  operationId: string;
  methodName: string;
  tag: string;
  httpMethod: string;
  path: string;
  description: string;
  apiProperty: string;
  apiClassName: string;

  // Params
  params: TemplateParam[];
  hasParams: boolean;
  requiredParams: TemplateParam[];
  optionalParams: TemplateParam[];
  hasRequiredParams: boolean;
  hasOptionalParams: boolean;

  // Body
  hasBody: boolean;
  bodyTypeName: string;
  bodyConstruction: string;

  // Pre-rendered code fragments
  paramDeclarations: string;
  methodCall: string;
  resultLine: string;

  // Config pass-through
  variables: Record<string, string>;
  boilerplate: ExamplesConfig['boilerplate'];

  // Markdown
  codeBlockLang: string;
}

export function buildTemplateContext(
  op: NormalizedOperation,
  config: ExamplesConfig,
  adapter: LanguageAdapter,
): TemplateContext {
  const methodName = adapter.toMethodName(op.operationId);
  const apiProperty = resolveApiProperty(op.tag, config.apiClassMap);
  const apiClassName = adapter.toApiClassName(op.tag);

  const params = op.parameters
    .filter((p) => !p.deprecated)
    .map((p) => {
      const override = resolveValueOverride(p.name, op.operationId, op.tag, config);
      return toTemplateParam(p, adapter, override);
    });

  const requiredParams = params.filter((p) => p.required);
  const optionalParams = params.filter((p) => !p.required);

  // Build parameter declarations
  const paramDeclarations = op.parameters
    .filter((p) => !p.deprecated && p.required)
    .map((p) => {
      const override = resolveValueOverride(p.name, op.operationId, op.tag, config);
      return adapter.buildParamDeclaration(p, override);
    })
    .filter(Boolean)
    .join('\n');

  // Build body construction
  const hasBody = !!op.requestBody;
  const bodyTypeName = op.requestBody?.schemaName ?? '';
  const bodyOverrides = resolveBodyOverrides(op.requestBody, op.operationId, op.tag, config);
  const bodyConstruction = op.requestBody
    ? adapter.buildBodyConstruction(op.requestBody, bodyOverrides)
    : '';

  // Build argument list for method call
  const argParts: string[] = [];
  for (const p of op.parameters.filter((p) => !p.deprecated && p.required)) {
    argParts.push(p.name);
  }
  if (hasBody) {
    argParts.push('body');
  }
  const args = argParts.join(', ');

  const clientVar = config.variables.clientVar ?? 'client';
  const apiAccessPattern = config.variables.apiAccessPattern ?? 'dot';

  const methodCall = adapter.buildMethodCall({
    clientVar,
    apiProperty,
    methodName,
    args,
    apiAccessPattern,
  });

  const resultLine = adapter.buildResultLine(methodCall, op.responseType);

  return {
    operationId: op.operationId,
    methodName,
    tag: op.tag,
    httpMethod: op.httpMethod,
    path: op.path,
    description: op.description ?? '',
    apiProperty,
    apiClassName,

    params,
    hasParams: params.length > 0,
    requiredParams,
    optionalParams,
    hasRequiredParams: requiredParams.length > 0,
    hasOptionalParams: optionalParams.length > 0,

    hasBody,
    bodyTypeName,
    bodyConstruction,

    paramDeclarations,
    methodCall,
    resultLine,

    variables: config.variables,
    boilerplate: config.boilerplate,
    codeBlockLang: adapter.codeBlockLang,
  };
}

function resolveApiProperty(tag: string, apiClassMap: Record<string, string>): string {
  if (apiClassMap[tag]) return apiClassMap[tag];
  // Fallback: camelCase the tag
  return tag
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function resolveValueOverride(
  paramName: string,
  operationId: string,
  tag: string,
  config: ExamplesConfig,
): string | undefined {
  const ov = config.paramOverrides;
  return ov.operations[operationId]?.[paramName]
    ?? ov.tags[tag]?.[paramName]
    ?? ov.global[paramName];
}

function resolveBodyOverrides(
  body: NormalizedOperation['requestBody'],
  operationId: string,
  tag: string,
  config: ExamplesConfig,
): Record<string, string> | undefined {
  if (!body?.schema.properties) return undefined;
  const result: Record<string, string> = {};
  let hasAny = false;
  for (const propName of Object.keys(body.schema.properties)) {
    const override = resolveValueOverride(propName, operationId, tag, config);
    if (override !== undefined) {
      result[propName] = override;
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

function toTemplateParam(param: NormalizedParam, adapter: LanguageAdapter, valueOverride?: string): TemplateParam {
  return {
    name: param.name,
    type: adapter.mapType(param.schema),
    description: param.description ?? '',
    required: param.required,
    defaultValue: param.schema.default != null ? String(param.schema.default) : '',
    exampleValue: valueOverride ?? adapter.exampleValue(param),
    hasDefault: param.schema.default != null,
  };
}
