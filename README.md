# @eulerstream/openapi-generator-examples

Generate clean, Stripe-like usage examples from OpenAPI specs. Supports multiple languages, custom templates, and structured JSON output.

## Table of Contents

- [Supported Generators](#supported-generators)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
  - [Config File](#config-file)
  - [Wrapper SDK Templates](#wrapper-sdk-templates)
  - [Parameter Overrides](#parameter-overrides)
  - [Output Formats](#output-formats)
- [Programmatic API](#programmatic-api)
- [Examples](#examples)
- [Contributing](#contributing)

## Supported Generators

| Generator | Language Names | Default Output Style |
|-----------|---------------|---------------------|
| TypeScript | `typescript`, `typescript-axios`, `typescript-fetch`, `typescript-angular`, `typescript-node` | Standard openapi-generator TypeScript |
| Python | `python`, `python-pydantic-v1`, `python-nextgen`, `python-prior` | Standard openapi-generator Python |
| Java | `java`, `java-helidon-client`, `java-helidon-server`, `java-micronaut-client` | Standard openapi-generator Java |
| C# | `csharp`, `csharp-netcore`, `csharp-functions` | Standard openapi-generator C# |
| Go | `go`, `go-server`, `go-gin-server` | Standard openapi-generator Go |
| curl | `curl` | Copy-pasteable curl commands |

> [!TIP]
> Each generator produces **standard openapi-generator output** by default. Wrapper SDK patterns (like a custom client class) are achieved through [config overrides + custom templates](#wrapper-sdk-templates).

## Installation

```bash
# npm
npm install @eulerstream/openapi-generator-examples

# pnpm
pnpm add @eulerstream/openapi-generator-examples
```

Or run directly with npx:

```bash
npx @eulerstream/openapi-generator-examples generate -i openapi.json -g typescript -o ./docs
```

## Quickstart

Generate examples from an OpenAPI spec with zero configuration:

```bash
openapi-generator-examples generate \
  -i ./openapi.json \
  -g typescript \
  -o ./docs
```

This produces per-operation markdown files at `./docs/usage/typescript/<tag>/<operation>.md` with standard openapi-generator style examples:

```typescript
import {
    PetsApi,
    Configuration,
} from './api';

const configuration = new Configuration();
const apiInstance = new PetsApi(configuration);

let petId: string = "petId_value";

const { status, data } = await apiInstance.getPetById(petId);
```

### CLI Options

```
Options:
  -i, --input <path>      Path to OpenAPI spec (JSON or YAML) [required]
  -g, --generator <name>  Generator/language name [required]
  -o, --output <dir>      Base output directory (default: ./usage)
  -c, --config <path>     Path to config YAML file
```

## Configuration

### Config File

Create a YAML config to customize output:

```yaml
boilerplate:
  showImports: true       # Include import statements (default: true)
  showTryCatch: false      # Wrap in try/catch (default: false)

variables:
  sdkPackage: "./api"          # Import path (default: "./api")
  clientVar: apiInstance       # Client variable name (default: "apiInstance")
  apiAccessPattern: direct     # "direct", "dot", or "call" (default: "direct")

apiClassMap:
  Pets: pets
  Store: store

outputFormats:
  - md
  - json
```

Pass it with `-c`:

```bash
openapi-generator-examples generate -i spec.json -g typescript -c config.yml -o ./docs
```

### Wrapper SDK Templates

To generate examples for a custom wrapper SDK instead of raw openapi-generator output, provide a custom Mustache template via `templatePath`:

```yaml
# config.yml
variables:
  sdkImport: "import EulerStreamApiClient from '@eulerstream/euler-api-sdk'"
  clientConstruction: "const client = new EulerStreamApiClient({ apiKey: 'YOUR_API_KEY' });"
  clientVar: client
  apiAccessPattern: dot

templatePath: ./my-wrapper.mustache

apiClassMap:
  TikTok LIVE: webcast
  Alerts: alerts
```

```mustache
{{! my-wrapper.mustache }}
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

This produces:

```typescript
import EulerStreamApiClient from '@eulerstream/euler-api-sdk'

const client = new EulerStreamApiClient({ apiKey: 'YOUR_API_KEY' });

let petId: string = "petId_value";

const { status, data } = await client.pets.getPetById(petId);
```

> [!NOTE]
> See the [`examples/`](./examples/) directory for complete per-language config + template examples.

### Parameter Overrides

Override example values at three levels of specificity (most-specific wins):

```yaml
paramOverrides:
  global:
    account_id: $account_id           # All operations

  tags:
    Accounts:
      account_id: $acct_id            # Operations tagged "Accounts"

  operations:
    GetSignUsage:
      from: $from                     # Only GetSignUsage
      to: $to
```

Override values use `$`-prefix and are **type-aware**: string params get quoted (`"$name"`), number/boolean/date params stay raw (`$account_id`).

### Output Formats

Control output format with `outputFormats`:

```yaml
outputFormats:
  - md      # Markdown files with code blocks
  - json    # Structured JSON per operation + combined index.json
```

JSON output produces per-operation `.json` files and a combined `index.json` containing all operations:

```json
{
  "operationId": "getPetById",
  "tag": "Pets",
  "httpMethod": "GET",
  "path": "/pets/{petId}",
  "description": "Get a specific pet by ID",
  "example": "import { PetsApi, Configuration } from './api';\n...",
  "codeBlockLang": "typescript",
  "parameters": [
    { "name": "petId", "type": "string", "required": true, "description": "The ID of the pet" }
  ]
}
```

## Programmatic API

```typescript
import { generate, loadConfig } from '@eulerstream/openapi-generator-examples';

const config = loadConfig('./config.yml');

const result = generate({
  inputSpec: './openapi.json',
  generator: 'typescript',
  outputDir: './docs',
  config,
});

console.log(`Generated ${result.operationCount} examples (${result.filesWritten.length} files)`);
```

## Examples

The [`examples/`](./examples/) directory contains per-language configurations and wrapper templates:

```
examples/
  typescript/
    typescript.config.yml         # Wrapper SDK config
    typescript-wrapper.mustache   # Custom template
  python/
    python.config.yml
    python-wrapper.mustache
  java/
    java.config.yml
    java-wrapper.mustache
  csharp/
    csharp.config.yml
    csharp-wrapper.mustache
  go/
    go.config.yml
    go-wrapper.mustache
  curl/
    curl.config.yml
```

Each config demonstrates the wrapper SDK pattern for its language. The tool works without any config (producing standard openapi-generator output) — these configs show how to customize for a specific SDK.

## Contributing

> [!IMPORTANT]
> We welcome PRs for new language generators! See [`docs/creating-generators.md`](./docs/creating-generators.md) for the full guide.

To add a new language:

1. Implement `LanguageAdapter` in `src/languages/<lang>.ts`
2. Create a default Mustache template in `src/templates/defaults/<lang>.mustache`
3. Register it in `src/languages/register-all.ts`
4. Add tests in `test/<lang>.test.ts`
5. Add example config in `examples/<lang>/`

```bash
# Development
pnpm install
pnpm test        # Run tests
pnpm typecheck   # Type check
pnpm build       # Build
```

## License

GPL-3.0 — see [LICENSE](./LICENSE) for details.
