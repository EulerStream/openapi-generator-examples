import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';

export interface MethodCallOptions {
  clientVar: string;
  apiProperty: string;
  methodName: string;
  args: string;
  apiAccessPattern: string;
}

export interface LanguageAdapter {
  /** Language identifier (e.g., 'typescript', 'java') */
  id: string;

  /** Generator names that map to this language (e.g., ['typescript-axios', 'typescript-fetch']) */
  generatorNames: string[];

  /** File extension for code blocks in generated markdown */
  codeBlockLang: string;

  /** Convert operationId to language-appropriate method name */
  toMethodName(operationId: string): string;

  /** Convert operationId to language-appropriate file name (without extension) */
  toFileName(operationId: string): string;

  /** Convert a tag name to a directory-friendly name */
  toTagDirectory(tag: string): string;

  /** Convert a tag name to the API class name (e.g., "Pets" → "PetsApi") */
  toApiClassName(tag: string): string;

  /** Map OpenAPI schema type to language-native type string */
  mapType(schema: NormalizedSchema): string;

  /** Generate a language-appropriate example value for a parameter */
  exampleValue(param: NormalizedParam): string;

  /** Generate parameter declaration code. If valueOverride is provided, use it as-is (raw code). */
  buildParamDeclaration(param: NormalizedParam, valueOverride?: string): string;

  /** Generate the method call expression */
  buildMethodCall(opts: MethodCallOptions): string;

  /** Generate request body construction code. valueOverrides maps property names to raw code values. */
  buildBodyConstruction(body: NormalizedRequestBody, valueOverrides?: Record<string, string>): string;

  /** Generate the result assignment line (e.g., `const result = await call;`) */
  buildResultLine(call: string, returnType: string | undefined): string;
}
