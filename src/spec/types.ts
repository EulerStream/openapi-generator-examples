export interface NormalizedSchema {
  type: string;
  format?: string;
  enum?: string[];
  default?: unknown;
  items?: NormalizedSchema;
  properties?: Record<string, NormalizedSchema>;
  required?: string[];
  description?: string;
}

export interface NormalizedParam {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema: NormalizedSchema;
  description?: string;
  example?: unknown;
  deprecated?: boolean;
}

export interface NormalizedRequestBody {
  required: boolean;
  schemaName?: string;
  schema: NormalizedSchema;
}

export interface NormalizedOperation {
  operationId: string;
  tag: string;
  httpMethod: string;
  path: string;
  description?: string;
  parameters: NormalizedParam[];
  requestBody?: NormalizedRequestBody;
  responseType?: string;
  security: string[];
}
