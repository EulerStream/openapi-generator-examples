import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { ExamplesConfigSchema, type ExamplesConfig } from './schema.js';

const DEFAULTS: Partial<ExamplesConfig> = {
  variables: {
    clientVar: 'apiInstance',
    apiKeyPlaceholder: 'YOUR_API_KEY',
    apiAccessPattern: 'direct',
    sdkPackage: './api',
  },
};

export function loadConfig(configPath: string): ExamplesConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);

  // Deep-merge defaults into variables
  const merged = {
    ...parsed,
    variables: {
      ...DEFAULTS.variables,
      ...parsed?.variables,
    },
  };

  const result = ExamplesConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config:\n${issues}`);
  }

  return result.data;
}

export function loadConfigOrDefault(configPath?: string): ExamplesConfig {
  if (configPath) {
    return loadConfig(configPath);
  }
  return ExamplesConfigSchema.parse({
    variables: { ...DEFAULTS.variables },
  });
}
