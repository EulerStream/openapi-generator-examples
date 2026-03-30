import { loadConfig, loadConfigOrDefault } from './config/loader.js';
import { generate } from './generator/pipeline.js';

// Register all language adapters
import './languages/register-all.js';

function printUsage(): void {
  console.log(`
Usage: openapi-generator-examples generate [options]

Generate clean usage examples from an OpenAPI spec.

Options:
  -i, --input <path>      Path to OpenAPI spec (JSON or YAML) [required]
  -g, --generator <name>  Generator/language name (e.g., java, typescript-axios) [required]
  -o, --output <dir>      Base output directory (default: ./usage)
  -c, --config <path>     Path to examples config YAML file

  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  openapi-generator-examples generate -i ./openapi.json -g java -o ./src/generated
  openapi-generator-examples generate -i ./spec.yaml -g typescript-axios -c ./examples.config.yml
`);
}

function printVersion(): void {
  console.log('0.1.0');
}

function parseArgs(argv: string[]): {
  command?: string;
  input?: string;
  generator?: string;
  output?: string;
  config?: string;
  help: boolean;
  version: boolean;
} {
  const result = {
    command: undefined as string | undefined,
    input: undefined as string | undefined,
    generator: undefined as string | undefined,
    output: undefined as string | undefined,
    config: undefined as string | undefined,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg === '-i' || arg === '--input') {
      result.input = argv[++i];
    } else if (arg === '-g' || arg === '--generator') {
      result.generator = argv[++i];
    } else if (arg === '-o' || arg === '--output') {
      result.output = argv[++i];
    } else if (arg === '-c' || arg === '--config') {
      result.config = argv[++i];
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
    }

    i++;
  }

  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  if (args.help || !args.command) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  if (args.command !== 'generate') {
    console.error(`Unknown command: "${args.command}". Use "generate".`);
    process.exit(1);
  }

  if (!args.input) {
    console.error('Missing required option: -i/--input <path>');
    process.exit(1);
  }

  if (!args.generator) {
    console.error('Missing required option: -g/--generator <name>');
    process.exit(1);
  }

  const config = args.config
    ? loadConfig(args.config)
    : loadConfigOrDefault();

  const result = generate({
    inputSpec: args.input,
    generator: args.generator,
    outputDir: args.output ?? '.',
    config,
  });

  console.log(
    `Generated ${result.operationCount} usage examples for ${result.languageId} ` +
    `(${result.filesWritten.length} files written)`,
  );
}

main();
