# Creating Language Generators

This guide explains how to add support for a new programming language to `@eulerstream/openapi-generator-examples`.

## Overview

The package generates per-operation usage example `.md` files from an OpenAPI spec. Each language needs:

1. **A Language Adapter** — TypeScript class implementing `LanguageAdapter` that handles language-specific naming, typing, and code generation
2. **A Mustache Template** — Default template that renders a complete code example
3. **Registration** — Adding the adapter to `src/languages/register-all.ts`

## Architecture

```
OpenAPI Spec → Spec Parser → Normalized Operations
                                      ↓
Config (YAML) + Language Adapter → Template Context
                                      ↓
Mustache Template → Rendered Example → .md files
```

The **spec parser** normalizes the OpenAPI spec into `NormalizedOperation[]`. The **template context builder** combines operations with config + language adapter to produce a `TemplateContext`. The **Mustache renderer** renders the template with the context to produce the example code string.

## Step 1: Implement the Language Adapter

Create `src/languages/<language>.ts`. Your adapter must implement the `LanguageAdapter` interface:

```typescript
import { registerLanguage } from './registry.js';
import type { LanguageAdapter, MethodCallOptions } from './types.js';
import type { NormalizedParam, NormalizedRequestBody, NormalizedSchema } from '../spec/types.js';

const adapter: LanguageAdapter = {
  id: 'mylang',
  generatorNames: ['mylang', 'mylang-client'],
  codeBlockLang: 'mylang',

  toMethodName(operationId: string): string {
    // Convert operationId to your language's method naming convention
    // e.g., camelCase for Java/TS, snake_case for Python, PascalCase for Go/C#
  },

  toFileName(operationId: string): string {
    // Convert operationId to a file-system-safe name
  },

  toTagDirectory(tag: string): string {
    // Convert an API tag to a directory name
  },

  mapType(schema: NormalizedSchema): string {
    // Map OpenAPI types to your language's native types
    // Handle: string, integer, number, boolean, array, object, enums
  },

  exampleValue(param: NormalizedParam): string {
    // Generate an example value for a parameter
    // Use param.example, param.schema.enum, param.schema.default, or synthesize
  },

  buildParamDeclaration(param: NormalizedParam): string {
    // Generate a variable declaration with example value
    // e.g., `String petId = "pet_123";`
  },

  buildMethodCall(opts: MethodCallOptions): string {
    // Build the method invocation expression
    // Use opts.apiAccessPattern: "dot" → client.pets.list()
    //                             "call" → client.pets().list()
  },

  buildBodyConstruction(body: NormalizedRequestBody): string {
    // Generate request body object construction
  },

  buildResultLine(call: string, returnType: string | undefined): string {
    // Generate the result assignment line
    // e.g., `MyType result = call;`
  },
};

// Self-register on import
registerLanguage(adapter);
export default adapter;
```

### Key Methods Explained

#### `toMethodName(operationId)`
Convert the OpenAPI `operationId` to your language's method naming convention:
- TypeScript/Java: `camelCase` → `listPets`
- Python: `snake_case` → `list_pets`
- Go/C#: `PascalCase` → `ListPets`

#### `mapType(schema)`
Map OpenAPI schema types to native types. Handle these cases:
- `string` → `String`, `str`, `string`
- `integer` → `int`, `Integer`, `int64`
- `number` → `double`, `float`, `float64`
- `boolean` → `bool`, `Boolean`
- `array` with `items` → `List<T>`, `[]T`, `list[T]`
- `object` → named type or generic map
- `enum` → language-appropriate enum reference

#### `exampleValue(param)`
Generate realistic example values. Priority:
1. Use `param.example` if present in the spec
2. Use `param.schema.enum[0]` for enum params
3. Use `param.schema.default` if present
4. Synthesize based on type + name heuristics (e.g., param named `email` → `"user@example.com"`)

#### `buildBodyConstruction(body)`
Generate code to construct the request body. If `body.schemaName` is present, use the named type. Use `body.schema.properties` to set fields with example values.

## Step 2: Create the Default Mustache Template

Create `src/templates/defaults/<language>.mustache`. The template receives a `TemplateContext` object.

### Available Template Variables

```
{{operationId}}           - Operation ID from spec
{{methodName}}            - Language-appropriate method name
{{tag}}                   - API tag
{{httpMethod}}            - HTTP method (GET, POST, etc.)
{{path}}                  - URL path
{{description}}           - Operation description
{{apiProperty}}           - Resolved wrapper property name

{{#hasParams}}...{{/hasParams}}           - Has any parameters
{{#hasRequiredParams}}...{{/hasRequiredParams}}  - Has required params
{{paramDeclarations}}     - Pre-rendered param declarations
{{methodCall}}            - Pre-rendered method call expression
{{resultLine}}            - Pre-rendered result assignment line

{{#hasBody}}...{{/hasBody}}  - Has request body
{{bodyTypeName}}             - Body schema name
{{bodyConstruction}}         - Pre-rendered body construction code

{{#boilerplate.showImports}}...{{/boilerplate.showImports}}
{{#boilerplate.showTryCatch}}...{{/boilerplate.showTryCatch}}
{{#boilerplate.showApiKeyConfig}}...{{/boilerplate.showApiKeyConfig}}

{{#variables}}
  {{sdkImport}}           - Import statement(s)
  {{clientConstruction}}  - Client construction code
  {{clientVar}}           - Client variable name
  {{apiKeyPlaceholder}}   - API key placeholder string
  {{apiAccessPattern}}    - "dot" or "call"
{{/variables}}
```

### Example Template (TypeScript)

```mustache
{{#boilerplate.showImports}}
{{{variables.sdkImport}}}

{{/boilerplate.showImports}}
{{{variables.clientConstruction}}}

{{#hasRequiredParams}}
{{{paramDeclarations}}}

{{/hasRequiredParams}}
{{#hasBody}}
{{{bodyConstruction}}}

{{/hasBody}}
{{{resultLine}}}
```

Note the use of `{{{triple-braces}}}` for unescaped output (we disable HTML escaping globally, but triple braces are conventional for multi-line content).

## Step 3: Register the Adapter

Add your import to `src/languages/register-all.ts`:

```typescript
import './mylang.js';
```

## Step 4: Config for Users

Users configure per-language behavior via `config.yml`:

```yaml
# examples.config.yml for MyLang SDK
boilerplate:
  showTryCatch: false
  showImports: true
  showApiKeyConfig: false

variables:
  sdkImport: "import MySDK from 'my-sdk'"
  clientConstruction: |
    client = MySDK.new(api_key: "YOUR_API_KEY")
  clientVar: client
  apiKeyPlaceholder: YOUR_API_KEY
  apiAccessPattern: dot

apiClassMap:
  Pets: pets
  Store: store

# Optional: override the default template
# templatePath: ./my-custom-template.mustache
```

### Key Config Fields

| Field | Description |
|-------|-------------|
| `boilerplate.showTryCatch` | Wrap examples in try-catch blocks |
| `boilerplate.showImports` | Show import statements |
| `boilerplate.showApiKeyConfig` | Show API key setup |
| `boilerplate.showFullClass` | Show full class wrapper (e.g., Java `public class Example { main... }`) |
| `variables.sdkImport` | The import statement(s) for your SDK |
| `variables.clientConstruction` | Code to construct the client |
| `variables.clientVar` | Variable name for the client |
| `variables.apiAccessPattern` | `"dot"` for `client.api.method()`, `"call"` for `client.api().method()` |
| `apiClassMap` | Maps OpenAPI tags to wrapper property names |
| `templatePath` | Path to custom mustache template (overrides built-in) |

### Custom Templates

If the default template doesn't meet your needs, provide a custom template:

```yaml
templatePath: ./my-template.mustache
```

Your custom template receives the exact same `TemplateContext` object as the default template. You can use any combination of the available variables, add custom formatting, or include additional fixed content.

## Output Structure

Generated files are organized by language and API tag:

```
usage/
  mylang/
    pets/
      listPets.md
      createPet.md
      getPetById.md
    store/
      getInventory.md
    index.md
```

Each `.md` file contains:
- Operation title and description
- HTTP method and path
- Code example (rendered from the template)
- Parameter table
- Request body info (if applicable)
