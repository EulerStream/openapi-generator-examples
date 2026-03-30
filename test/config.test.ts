import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-test-'));
  const filePath = path.join(dir, 'config.yml');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('config loader', () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    for (const p of tempPaths) {
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
    tempPaths.length = 0;
  });

  it('loads a valid config with all fields', () => {
    const p = writeTempConfig(`
boilerplate:
  showTryCatch: true
  showImports: true
  showApiKeyConfig: false
  showFullClass: false

variables:
  sdkImport: "import SDK from 'my-sdk'"
  clientConstruction: "const client = new SDK();"
  clientVar: sdk

apiClassMap:
  Pets: animals
  Store: shop
`);
    tempPaths.push(p);

    const config = loadConfig(p);
    expect(config.boilerplate.showTryCatch).toBe(true);
    expect(config.variables.clientVar).toBe('sdk');
    expect(config.variables.sdkImport).toBe("import SDK from 'my-sdk'");
    expect(config.apiClassMap.Pets).toBe('animals');
  });

  it('applies defaults for missing fields', () => {
    const p = writeTempConfig(`
variables:
  sdkImport: "import X from 'x'"
`);
    tempPaths.push(p);

    const config = loadConfig(p);
    expect(config.boilerplate.showTryCatch).toBe(false);
    expect(config.boilerplate.showImports).toBe(true);
    expect(config.variables.clientVar).toBe('apiInstance');
    expect(config.variables.apiKeyPlaceholder).toBe('YOUR_API_KEY');
    expect(config.variables.apiAccessPattern).toBe('direct');
    expect(config.variables.sdkPackage).toBe('./api');
    expect(config.variables.sdkImport).toBe("import X from 'x'");
  });

  it('returns a valid default config when no path given', () => {
    const config = loadConfigOrDefault();
    expect(config.boilerplate.showTryCatch).toBe(false);
    expect(config.variables.clientVar).toBe('apiInstance');
    expect(config.variables.apiAccessPattern).toBe('direct');
    expect(config.variables.sdkPackage).toBe('./api');
    expect(config.apiClassMap).toEqual({});
    expect(config.paramOverrides).toEqual({ global: {}, tags: {}, operations: {} });
  });

  it('loads paramOverrides from config', () => {
    const p = writeTempConfig(`
paramOverrides:
  global:
    account_id: "{{account_id}}"
  tags:
    Accounts:
      account_id: "{{acct}}"
  operations:
    GetSignUsage:
      from: "{{from}}"
      to: "{{to}}"
`);
    tempPaths.push(p);

    const config = loadConfig(p);
    expect(config.paramOverrides.global.account_id).toBe('{{account_id}}');
    expect(config.paramOverrides.tags.Accounts.account_id).toBe('{{acct}}');
    expect(config.paramOverrides.operations.GetSignUsage.from).toBe('{{from}}');
    expect(config.paramOverrides.operations.GetSignUsage.to).toBe('{{to}}');
  });

  it('throws on missing file', () => {
    expect(() => loadConfig('/nonexistent/config.yml')).toThrow('Config file not found');
  });
});
