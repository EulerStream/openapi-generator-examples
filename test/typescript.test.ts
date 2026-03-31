import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/typescript.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('typescript adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('typescript');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('keeps camelCase as-is', () => {
      expect(adapter.toMethodName('listPets')).toBe('listPets');
    });

    it('lowercases PascalCase first char', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('getPetById');
    });

    it('converts kebab-case', () => {
      expect(adapter.toMethodName('list-pets')).toBe('listPets');
    });
  });

  describe('toFileName', () => {
    it('returns camelCase', () => {
      expect(adapter.toFileName('listPets')).toBe('listPets');
      expect(adapter.toFileName('GetPetById')).toBe('getPetById');
    });
  });

  describe('toTagDirectory', () => {
    it('converts to kebab-case lowercase', () => {
      expect(adapter.toTagDirectory('Pets')).toBe('pets');
      expect(adapter.toTagDirectory('TikTok LIVE')).toBe('tik-tok-live');
      expect(adapter.toTagDirectory('MyTag')).toBe('my-tag');
    });
  });

  describe('toApiClassName', () => {
    it('appends Api suffix to single word', () => {
      expect(adapter.toApiClassName('Pets')).toBe('PetsApi');
    });

    it('removes spaces and appends Api suffix', () => {
      expect(adapter.toApiClassName('TikTok LIVE')).toBe('TikTokLIVEApi');
    });

    it('handles multi-word tags', () => {
      expect(adapter.toApiClassName('Alert Targets')).toBe('AlertTargetsApi');
    });

    it('capitalizes first letter', () => {
      expect(adapter.toApiClassName('store')).toBe('StoreApi');
    });

    it('handles Default tag', () => {
      expect(adapter.toApiClassName('Default')).toBe('DefaultApi');
    });
  });

  describe('mapType', () => {
    it('maps string', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('string');
    });

    it('maps integer to number', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('number');
    });

    it('maps number', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('number');
    });

    it('maps boolean', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('boolean');
    });

    it('maps string with date format to Date', () => {
      expect(adapter.mapType({ type: 'string', format: 'date' })).toBe('Date');
    });

    it('maps string with date-time format to Date', () => {
      expect(adapter.mapType({ type: 'string', format: 'date-time' })).toBe('Date');
    });

    it('maps array with items', () => {
      expect(adapter.mapType({ type: 'array', items: { type: 'string' } })).toBe('string[]');
    });

    it('maps array without items', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('unknown[]');
    });

    it('maps object', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('Record<string, unknown>');
    });

    it('maps unknown type', () => {
      expect(adapter.mapType({ type: '' })).toBe('unknown');
    });
  });

  describe('exampleValue', () => {
    it('uses param.example if present (string)', () => {
      const param: NormalizedParam = {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        example: 'abc123',
      };
      expect(adapter.exampleValue(param)).toBe('"abc123"');
    });

    it('uses param.example if present (number)', () => {
      const param: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
        example: 42,
      };
      expect(adapter.exampleValue(param)).toBe('42');
    });

    it('uses enum first value', () => {
      const param: NormalizedParam = {
        name: 'status',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['available', 'pending', 'sold'] },
      };
      expect(adapter.exampleValue(param)).toBe('"available"');
    });

    it('falls back to new Date() for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('new Date()');
    });

    it('uses schema default', () => {
      const param: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', default: 20 },
      };
      expect(adapter.exampleValue(param)).toBe('20');
    });

    it('falls back by type (string)', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.exampleValue(param)).toBe('"name_value"');
    });

    it('falls back by type (integer)', () => {
      const param: NormalizedParam = {
        name: 'count',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
      };
      expect(adapter.exampleValue(param)).toBe('0');
    });

    it('falls back by type (boolean)', () => {
      const param: NormalizedParam = {
        name: 'active',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
      };
      expect(adapter.exampleValue(param)).toBe('true');
    });
  });

  describe('buildParamDeclaration', () => {
    it('generates let declaration with type annotation', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param)).toBe('let petId: string = "petId_value";');
    });

    it('uses valueOverride as-is for non-string types', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('let account_id: number = $account_id;');
    });

    it('wraps valueOverride in quotes for string types', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param, '$name')).toBe('let name: string = "$name";');
    });

    it('does not quote valueOverride for date types', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.buildParamDeclaration(param, '$from')).toBe('let from: Date = $from;');
    });
  });

  describe('buildMethodCall', () => {
    it('builds direct access pattern (no apiProperty chain)', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'apiInstance',
        apiProperty: 'pets',
        methodName: 'listPets',
        args: '',
        apiAccessPattern: 'direct',
      });
      expect(result).toBe('apiInstance.listPets()');
    });

    it('builds dot access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'listPets',
        args: '',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('client.pets.listPets()');
    });

    it('builds call access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'getPetById',
        args: 'petId',
        apiAccessPattern: 'call',
      });
      expect(result).toBe('client.pets().getPetById(petId)');
    });

    it('includes args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'sdk',
        apiProperty: 'store',
        methodName: 'getInventory',
        args: 'limit, offset',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('sdk.store.getInventory(limit, offset)');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates typed body with required properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreatePetRequest',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tag: { type: 'string' },
            status: { type: 'string', enum: ['available', 'pending', 'sold'], default: 'available' },
          },
          required: ['name'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('const body: CreatePetRequest = {');
      expect(result).toContain('name: "name_value"');
      expect(result).toContain('};');
      expect(result).not.toContain('tag:');
      expect(result).not.toContain('status:');
    });

    it('uses Record<string, unknown> when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('const body: Record<string, unknown> = {');
    });

    it('generates nested object literals', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreateAlertTargetPayload',
        schema: {
          type: 'object',
          properties: {
            url: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                port: { type: 'integer' },
              },
              required: ['host', 'port'],
            },
            name: { type: 'string' },
          },
          required: ['url', 'name'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('const body: CreateAlertTargetPayload = {');
      expect(result).toContain('url: {');
      expect(result).toContain('host: "host_value",');
      expect(result).toContain('port: 0,');
      expect(result).toContain('name: "name_value",');
    });

    it('generates empty object for object without properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'Payload',
        schema: {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
          required: ['metadata'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('metadata: {},');
    });

    it('generates array example values', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'Payload',
        schema: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            ids: { type: 'array', items: { type: 'integer' } },
          },
          required: ['tags', 'ids'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('tags: ["item_value"],');
      expect(result).toContain('ids: [0],');
    });

    it('wraps string overrides in quotes, leaves others raw', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreatePetRequest',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'integer' },
            tag: { type: 'string' },
          },
          required: ['name', 'count', 'tag'],
        },
      };
      const result = adapter.buildBodyConstruction(body, { name: '$name', count: '$count' });
      expect(result).toContain('name: "$name",');
      expect(result).toContain('count: $count,');
      expect(result).toContain('tag: "tag_value",');
    });
  });

  describe('buildResultLine', () => {
    it('generates destructured assignment when return type exists', () => {
      const result = adapter.buildResultLine('apiInstance.listPets()', 'Pet[]');
      expect(result).toBe('const { status, data } = await apiInstance.listPets();');
    });

    it('generates await-only when no return type', () => {
      const result = adapter.buildResultLine('apiInstance.deletePet(petId)', undefined);
      expect(result).toBe('await apiInstance.deletePet(petId);');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-ts-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'typescript',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'typescript', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'typescript', 'store');

      expect(fs.existsSync(path.join(petsDir, 'listPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'createPet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'getInventory.md'))).toBe(true);
    });

    it('generates standard openapi-generator style for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```typescript');
      expect(content).toContain('PetsApi');
      expect(content).toContain('Configuration');
      expect(content).toContain("from './api'");
      expect(content).toContain('const apiInstance = new PetsApi(configuration);');
      expect(content).toContain('let petId: string = "petId_value";');
      expect(content).toContain('const { status, data } = await apiInstance.getPetById(petId);');
    });

    it('uses direct method call pattern (no apiProperty chain)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'listPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('.pets.');
      expect(content).toContain('apiInstance.listPets(limit, offset)');
    });

    it('generates correct output for Store tag', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'store', 'getInventory.md'),
        'utf-8',
      );
      expect(content).toContain('StoreApi');
      expect(content).toContain('const apiInstance = new StoreApi(configuration);');
    });

    it('generates correct output for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'deletePet.md'),
        'utf-8',
      );
      expect(content).toContain('await apiInstance.deletePet(petId);');
      expect(content).not.toContain('const { status, data }');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'typescript', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (typescript)');
      expect(content).toContain('listPets');
    });
  });

  describe('end-to-end generate (wrapper pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-ts-wrapper-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'typescript', 'typescript.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'typescript',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'typescript', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'typescript', 'store');

      expect(fs.existsSync(path.join(petsDir, 'listPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'createPet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'updatePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'deletePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'findPetsByStatus.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'getInventory.md'))).toBe(true);
    });

    it('generates wrapper-style TypeScript for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```typescript');
      expect(content).toContain("import EulerStreamApiClient from '@eulerstream/euler-api-sdk'");
      expect(content).toContain('const client = new EulerStreamApiClient');
      expect(content).toContain('let petId: string = "petId_value";');
      expect(content).toContain('const { status, data } = await client.pets.getPetById(petId);');
    });

    it('generates correct TypeScript for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'deletePet.md'),
        'utf-8',
      );
      expect(content).toContain('await client.pets.deletePet(petId);');
      expect(content).not.toContain('const { status, data }');
    });

    it('generates correct TypeScript for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'createPet.md'),
        'utf-8',
      );
      expect(content).toContain('const body: CreatePetRequest = {');
      expect(content).toContain('name: "name_value"');
    });

    it('generates correct TypeScript for findPetsByStatus (enum param)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'findPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('let status: FindPetsByStatusStatusEnum = FindPetsByStatusStatusEnum.Available;');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-ts-overrides-'));
      const config = loadConfigOrDefault();
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'typescript',
        outputDir,
        config,
      });
    });

    it('applies global override to petId (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('let petId: string = "$petId";');
    });

    it('applies tag-level override to status (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'findPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('let status: string = "$status";');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'createPet.md'),
        'utf-8',
      );
      expect(content).toContain('name: "$name",');
    });

    it('does not override params without matching rules', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'listPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('$');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-ts-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'typescript',
        outputDir,
        config,
      });
    });

    it('writes .json files instead of .md', () => {
      const petsDir = path.join(outputDir, 'usage', 'typescript', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'getPetById.json'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(false);
    });

    it('produces valid JSON with expected structure', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'getPetById.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.path).toBe('/pets/{petId}');
      expect(data.codeBlockLang).toBe('typescript');
      expect(data.example).toContain('apiInstance.getPetById(petId)');
      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('petId');
      expect(data.parameters[0].type).toBe('string');
      expect(data.parameters[0].required).toBe(true);
    });

    it('includes requestBody for createPet', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'createPet.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.typeName).toBe('CreatePetRequest');
      expect(data.requestBody.construction).toContain('name: "name_value"');
    });

    it('omits requestBody when absent', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'typescript', 'pets', 'listPets.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeUndefined();
    });

    it('writes an index.json containing all operations', () => {
      const indexPath = path.join(outputDir, 'usage', 'typescript', 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(data).toHaveLength(7);
      const ids = data.map((e: { operationId: string }) => e.operationId);
      expect(ids).toContain('getPetById');
      expect(ids).toContain('listPets');
      expect(ids).toContain('getInventory');
    });
  });

  describe('end-to-end generate (both formats)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-ts-both-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['md', 'json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'typescript',
        outputDir,
        config,
      });
    });

    it('writes both .md and .json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'typescript', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.json'))).toBe(true);
    });
  });
});
